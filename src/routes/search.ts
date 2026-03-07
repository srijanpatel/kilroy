import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db, sqlite } from "../db";

export const searchRouter = new Hono();

searchRouter.get("/", (c) => {
  const query = c.req.query("query");
  if (!query) {
    return c.json(
      { error: "Missing required parameter: query", code: "INVALID_INPUT" },
      400
    );
  }

  const regex = c.req.query("regex") === "true";
  const topic = c.req.query("topic");
  const tagsParam = c.req.query("tags");
  const status = c.req.query("status") || "active";
  const orderBy = c.req.query("order_by") || "relevance";
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "20"), 1), 100);
  const cursor = c.req.query("cursor");

  if (regex) {
    return regexSearch(c, { query, topic, tagsParam, status, orderBy, limit, cursor });
  }

  return ftsSearch(c, { query, topic, tagsParam, status, orderBy, limit, cursor });
});

function ftsSearch(
  c: any,
  opts: {
    query: string;
    topic?: string;
    tagsParam?: string;
    status: string;
    orderBy: string;
    limit: number;
    cursor?: string;
  }
) {
  const { query, topic, tagsParam, status, orderBy, limit, cursor } = opts;

  // Search posts FTS
  const postMatches = sqlite
    .prepare(
      `
      SELECT
        pf.post_id,
        snippet(posts_fts, 2, '**', '**', '...', 40) as snippet,
        pf.rank,
        'title_or_body' as match_location
      FROM posts_fts pf
      WHERE posts_fts MATCH ?
      ORDER BY pf.rank
      LIMIT ?
    `
    )
    .all(escapeQuery(query), limit * 2) as Array<{
    post_id: string;
    snippet: string;
    rank: number;
    match_location: string;
  }>;

  // Search comments FTS
  const commentMatches = sqlite
    .prepare(
      `
      SELECT
        cf.post_id,
        cf.comment_id,
        snippet(comments_fts, 2, '**', '**', '...', 40) as snippet,
        cf.rank,
        'comment' as match_location
      FROM comments_fts cf
      WHERE comments_fts MATCH ?
      ORDER BY cf.rank
      LIMIT ?
    `
    )
    .all(escapeQuery(query), limit * 2) as Array<{
    post_id: string;
    comment_id: string;
    snippet: string;
    rank: number;
    match_location: string;
  }>;

  // Merge and dedupe by post_id, keeping best match per post
  const bestByPost = new Map<
    string,
    { snippet: string; rank: number; match_location: string }
  >();

  for (const m of postMatches) {
    const existing = bestByPost.get(m.post_id);
    if (!existing || m.rank < existing.rank) {
      // Check if match is in title by also checking title FTS
      const titleMatch = sqlite
        .prepare(
          `SELECT snippet(posts_fts, 1, '**', '**', '...', 40) as snippet FROM posts_fts WHERE post_id = ? AND posts_fts MATCH ?`
        )
        .get(m.post_id, escapeQuery(query)) as { snippet: string } | undefined;

      bestByPost.set(m.post_id, {
        snippet: m.snippet,
        rank: m.rank,
        match_location: titleMatch?.snippet?.includes("**") ? "title" : "body",
      });
    }
  }

  for (const m of commentMatches) {
    const existing = bestByPost.get(m.post_id);
    if (!existing || m.rank < existing.rank) {
      bestByPost.set(m.post_id, {
        snippet: m.snippet,
        rank: m.rank,
        match_location: "comment",
      });
    }
  }

  // Fetch post details for all matched post IDs
  const postIds = Array.from(bestByPost.keys());
  if (postIds.length === 0) {
    return c.json({ query, results: [], has_more: false });
  }

  const placeholders = postIds.map(() => "?").join(",");
  let postQuery = `SELECT * FROM posts WHERE id IN (${placeholders})`;
  const params: any[] = [...postIds];

  if (status !== "all") {
    postQuery += ` AND status = ?`;
    params.push(status);
  }
  if (topic) {
    postQuery += ` AND (topic = ? OR topic LIKE ?)`;
    params.push(topic, `${topic}/%`);
  }

  const matchedPosts = sqlite.prepare(postQuery).all(...params) as Array<{
    id: string;
    title: string;
    topic: string;
    status: string;
    tags: string | null;
  }>;

  // Apply tag filter
  let filtered = matchedPosts;
  if (tagsParam) {
    const requiredTags = tagsParam.split(",").map((t) => t.trim());
    filtered = matchedPosts.filter((p) => {
      const postTags: string[] = p.tags ? JSON.parse(p.tags) : [];
      return requiredTags.every((t) => postTags.includes(t));
    });
  }

  // Sort
  let results = filtered.map((p, i) => {
    const match = bestByPost.get(p.id)!;
    return {
      post_id: p.id,
      title: p.title,
      topic: p.topic,
      status: p.status,
      tags: p.tags ? JSON.parse(p.tags) : [],
      snippet: match.snippet,
      match_location: match.match_location,
      rank: i + 1,
      _sort_rank: match.rank,
      _updated_at: (p as any).updated_at,
      _created_at: (p as any).created_at,
    };
  });

  if (orderBy === "updated_at") {
    results.sort((a, b) => b._updated_at.localeCompare(a._updated_at));
  } else if (orderBy === "created_at") {
    results.sort((a, b) => b._created_at.localeCompare(a._created_at));
  } else {
    results.sort((a, b) => a._sort_rank - b._sort_rank);
  }

  // Apply cursor (offset-based for simplicity since FTS ranks aren't stable)
  let startIdx = 0;
  if (cursor) {
    startIdx = parseInt(cursor) || 0;
  }

  const paged = results.slice(startIdx, startIdx + limit);
  const hasMore = startIdx + limit < results.length;

  // Clean up internal fields and assign rank
  const cleanResults = paged.map((r, i) => ({
    post_id: r.post_id,
    title: r.title,
    topic: r.topic,
    status: r.status,
    tags: r.tags,
    snippet: r.snippet,
    match_location: r.match_location,
    rank: startIdx + i + 1,
  }));

  const response: any = { query, results: cleanResults };
  if (hasMore) {
    response.next_cursor = String(startIdx + limit);
    response.has_more = true;
  }

  return c.json(response);
}

function regexSearch(
  c: any,
  opts: {
    query: string;
    topic?: string;
    tagsParam?: string;
    status: string;
    orderBy: string;
    limit: number;
    cursor?: string;
  }
) {
  const { query, topic, tagsParam, status, orderBy, limit, cursor } = opts;

  // For regex, we search directly against the posts and comments tables
  let postQuery = `SELECT * FROM posts WHERE (title REGEXP ? OR body REGEXP ?)`;
  const params: any[] = [query, query];

  if (status !== "all") {
    postQuery += ` AND status = ?`;
    params.push(status);
  }
  if (topic) {
    postQuery += ` AND (topic = ? OR topic LIKE ?)`;
    params.push(topic, `${topic}/%`);
  }

  // SQLite doesn't have REGEXP by default in all builds, so we fall back
  // to LIKE with % wildcards if REGEXP fails
  let matchedPosts: any[];
  try {
    matchedPosts = sqlite.prepare(postQuery).all(...params);
  } catch {
    // Fallback: treat as LIKE pattern
    const likeQuery = postQuery.replace(/REGEXP/g, "LIKE");
    const likePattern = `%${query}%`;
    matchedPosts = sqlite.prepare(likeQuery).all(likePattern, likePattern, ...params.slice(2));
  }

  // Also search comments
  let commentPostIds: string[] = [];
  try {
    const commentResults = sqlite
      .prepare(`SELECT DISTINCT post_id FROM comments WHERE body REGEXP ?`)
      .all(query) as Array<{ post_id: string }>;
    commentPostIds = commentResults.map((r) => r.post_id);
  } catch {
    const commentResults = sqlite
      .prepare(`SELECT DISTINCT post_id FROM comments WHERE body LIKE ?`)
      .all(`%${query}%`) as Array<{ post_id: string }>;
    commentPostIds = commentResults.map((r) => r.post_id);
  }

  // Merge post IDs
  const allPostIds = new Set(matchedPosts.map((p) => p.id));
  const commentOnlyIds = commentPostIds.filter((id) => !allPostIds.has(id));

  if (commentOnlyIds.length > 0) {
    const placeholders = commentOnlyIds.map(() => "?").join(",");
    let extraQuery = `SELECT * FROM posts WHERE id IN (${placeholders})`;
    const extraParams: any[] = [...commentOnlyIds];
    if (status !== "all") {
      extraQuery += ` AND status = ?`;
      extraParams.push(status);
    }
    if (topic) {
      extraQuery += ` AND (topic = ? OR topic LIKE ?)`;
      extraParams.push(topic, `${topic}/%`);
    }
    const extraPosts = sqlite.prepare(extraQuery).all(...extraParams) as any[];
    matchedPosts.push(...extraPosts);
  }

  // Apply tag filter
  if (tagsParam) {
    const requiredTags = tagsParam.split(",").map((t) => t.trim());
    matchedPosts = matchedPosts.filter((p: any) => {
      const postTags: string[] = p.tags ? JSON.parse(p.tags) : [];
      return requiredTags.every((t) => postTags.includes(t));
    });
  }

  // Create snippets
  const results = matchedPosts.map((p: any) => {
    let snippet = "";
    let matchLocation = "body";
    const re = new RegExp(query, "i");

    if (re.test(p.title)) {
      snippet = p.title;
      matchLocation = "title";
    } else if (re.test(p.body)) {
      const idx = p.body.search(re);
      const start = Math.max(0, idx - 40);
      const end = Math.min(p.body.length, idx + 40);
      snippet = (start > 0 ? "..." : "") + p.body.slice(start, end) + (end < p.body.length ? "..." : "");
      matchLocation = "body";
    } else {
      matchLocation = "comment";
      snippet = "Match found in comments";
    }

    return {
      post_id: p.id,
      title: p.title,
      topic: p.topic,
      status: p.status,
      tags: p.tags ? JSON.parse(p.tags) : [],
      snippet,
      match_location: matchLocation,
      rank: 0,
      _updated_at: p.updated_at,
      _created_at: p.created_at,
    };
  });

  // Sort
  if (orderBy === "updated_at") {
    results.sort((a: any, b: any) => b._updated_at.localeCompare(a._updated_at));
  } else if (orderBy === "created_at") {
    results.sort((a: any, b: any) => b._created_at.localeCompare(a._created_at));
  }

  // Paginate
  let startIdx = 0;
  if (cursor) startIdx = parseInt(cursor) || 0;

  const paged = results.slice(startIdx, startIdx + limit);
  const hasMore = startIdx + limit < results.length;

  const cleanResults = paged.map((r: any, i: number) => ({
    post_id: r.post_id,
    title: r.title,
    topic: r.topic,
    status: r.status,
    tags: r.tags,
    snippet: r.snippet,
    match_location: r.match_location,
    rank: startIdx + i + 1,
  }));

  const response: any = { query, results: cleanResults };
  if (hasMore) {
    response.next_cursor = String(startIdx + limit);
    response.has_more = true;
  }

  return c.json(response);
}

function escapeQuery(query: string): string {
  // Escape special FTS5 characters, then wrap each word in double quotes
  return query
    .replace(/['"\\]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `"${word}"`)
    .join(" ");
}
