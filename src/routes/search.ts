import { Hono } from "hono";
import { client } from "../db";
import type { Env } from "../types";

export const searchRouter = new Hono<Env>();

searchRouter.get("/", async (c) => {
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

  const workspaceId = c.get("workspaceId");

  if (regex) {
    return regexSearch(c, { query, workspaceId, topic, tagsParam, status, orderBy, limit, cursor });
  }

  return ftsSearch(c, { query, workspaceId, topic, tagsParam, status, orderBy, limit, cursor });
});

async function ftsSearch(
  c: any,
  opts: {
    query: string;
    workspaceId: string;
    topic?: string;
    tagsParam?: string;
    status: string;
    orderBy: string;
    limit: number;
    cursor?: string;
  }
) {
  const { query, workspaceId, topic, tagsParam, status, orderBy, limit, cursor } = opts;
  const tsquery = toTsquery(query);

  // Search posts using tsvector
  const postMatches = await client.unsafe(`
    SELECT
      p.id as post_id,
      ts_headline('english', p.body, to_tsquery('english', $1),
        'StartSel=**, StopSel=**, MaxFragments=1, MaxWords=40') as snippet,
      ts_rank(p.search_vector, to_tsquery('english', $1)) as rank,
      ts_headline('english', p.title, to_tsquery('english', $1),
        'StartSel=**, StopSel=**') as title_headline
    FROM posts p
    WHERE p.search_vector @@ to_tsquery('english', $1)
      AND p.workspace_id = $2
    ORDER BY rank DESC
    LIMIT $3
  `, [tsquery, workspaceId, limit * 2]) as Array<{
    post_id: string;
    snippet: string;
    rank: number;
    title_headline: string;
  }>;

  // Search comments using tsvector
  const commentMatches = await client.unsafe(`
    SELECT
      cm.post_id,
      cm.id as comment_id,
      ts_headline('english', cm.body, to_tsquery('english', $1),
        'StartSel=**, StopSel=**, MaxFragments=1, MaxWords=40') as snippet,
      ts_rank(cm.search_vector, to_tsquery('english', $1)) as rank
    FROM comments cm
    WHERE cm.search_vector @@ to_tsquery('english', $1)
      AND cm.workspace_id = $2
    ORDER BY rank DESC
    LIMIT $3
  `, [tsquery, workspaceId, limit * 2]) as Array<{
    post_id: string;
    comment_id: string;
    snippet: string;
    rank: number;
  }>;

  // Merge and dedupe by post_id, keeping best match per post
  const bestByPost = new Map<
    string,
    { snippet: string; rank: number; match_location: string }
  >();

  for (const m of postMatches) {
    const existing = bestByPost.get(m.post_id);
    if (!existing || m.rank > existing.rank) {
      bestByPost.set(m.post_id, {
        snippet: m.snippet,
        rank: m.rank,
        match_location: m.title_headline?.includes("**") ? "title" : "body",
      });
    }
  }

  for (const m of commentMatches) {
    const existing = bestByPost.get(m.post_id);
    if (!existing || m.rank > existing.rank) {
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

  const placeholders = postIds.map((_, i) => `$${i + 1}`).join(",");
  let postQuery = `SELECT * FROM posts WHERE id IN (${placeholders}) AND workspace_id = $${postIds.length + 1}`;
  const params: any[] = [...postIds, workspaceId];
  let paramIdx = postIds.length + 2;

  if (status !== "all") {
    postQuery += ` AND status = $${paramIdx++}`;
    params.push(status);
  }
  if (topic) {
    postQuery += ` AND (topic = $${paramIdx} OR topic LIKE $${paramIdx + 1})`;
    params.push(topic, `${topic}/%`);
    paramIdx += 2;
  }

  const matchedPosts = await client.unsafe(postQuery, params) as Array<{
    id: string;
    title: string;
    topic: string;
    status: string;
    tags: string | null;
    updated_at: Date;
    created_at: Date;
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
      _updated_at: p.updated_at instanceof Date ? p.updated_at.toISOString() : p.updated_at,
      _created_at: p.created_at instanceof Date ? p.created_at.toISOString() : p.created_at,
    };
  });

  if (orderBy === "updated_at") {
    results.sort((a, b) => b._updated_at.localeCompare(a._updated_at));
  } else if (orderBy === "created_at") {
    results.sort((a, b) => b._created_at.localeCompare(a._created_at));
  } else {
    results.sort((a, b) => b._sort_rank - a._sort_rank);
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
    updated_at: r._updated_at,
  }));

  const response: any = { query, results: cleanResults };
  if (hasMore) {
    response.next_cursor = String(startIdx + limit);
    response.has_more = true;
  }

  return c.json(response);
}

async function regexSearch(
  c: any,
  opts: {
    query: string;
    workspaceId: string;
    topic?: string;
    tagsParam?: string;
    status: string;
    orderBy: string;
    limit: number;
    cursor?: string;
  }
) {
  const { query, workspaceId, topic, tagsParam, status, orderBy, limit, cursor } = opts;

  // PostgreSQL native regex with ~* (case-insensitive)
  let postQuery = `SELECT * FROM posts WHERE workspace_id = $1 AND (title ~* $2 OR body ~* $3)`;
  const params: any[] = [workspaceId, query, query];
  let paramIdx = 4;

  if (status !== "all") {
    postQuery += ` AND status = $${paramIdx++}`;
    params.push(status);
  }
  if (topic) {
    postQuery += ` AND (topic = $${paramIdx} OR topic LIKE $${paramIdx + 1})`;
    params.push(topic, `${topic}/%`);
    paramIdx += 2;
  }

  let matchedPosts = await client.unsafe(postQuery, params) as any[];

  // Also search comments (scoped to workspace)
  const commentResults = await client.unsafe(
    `SELECT DISTINCT post_id FROM comments WHERE workspace_id = $1 AND body ~* $2`,
    [workspaceId, query]
  ) as Array<{ post_id: string }>;
  const commentPostIds = commentResults.map((r) => r.post_id);

  // Merge post IDs
  const allPostIds = new Set(matchedPosts.map((p: any) => p.id));
  const commentOnlyIds = commentPostIds.filter((id) => !allPostIds.has(id));

  if (commentOnlyIds.length > 0) {
    const placeholders = commentOnlyIds.map((_, i) => `$${i + 1}`).join(",");
    let extraQuery = `SELECT * FROM posts WHERE id IN (${placeholders}) AND workspace_id = $${commentOnlyIds.length + 1}`;
    const extraParams: any[] = [...commentOnlyIds, workspaceId];
    let extraIdx = commentOnlyIds.length + 2;
    if (status !== "all") {
      extraQuery += ` AND status = $${extraIdx++}`;
      extraParams.push(status);
    }
    if (topic) {
      extraQuery += ` AND (topic = $${extraIdx} OR topic LIKE $${extraIdx + 1})`;
      extraParams.push(topic, `${topic}/%`);
      extraIdx += 2;
    }
    const extraPosts = await client.unsafe(extraQuery, extraParams) as any[];
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

    const updatedAt = p.updated_at instanceof Date ? p.updated_at.toISOString() : p.updated_at;
    const createdAt = p.created_at instanceof Date ? p.created_at.toISOString() : p.created_at;

    return {
      post_id: p.id,
      title: p.title,
      topic: p.topic,
      status: p.status,
      tags: p.tags ? JSON.parse(p.tags) : [],
      snippet,
      match_location: matchLocation,
      rank: 0,
      _updated_at: updatedAt,
      _created_at: createdAt,
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
    updated_at: r._updated_at,
  }));

  const response: any = { query, results: cleanResults };
  if (hasMore) {
    response.next_cursor = String(startIdx + limit);
    response.has_more = true;
  }

  return c.json(response);
}

/**
 * Convert a user search query into a PostgreSQL tsquery string.
 * Each word is joined with & (AND) for matching all terms.
 */
function toTsquery(query: string): string {
  return query
    .replace(/['"\\:&|!()]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" & ");
}
