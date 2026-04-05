import { Hono } from "hono";
import { eq, and, like, or, sql, desc, asc } from "drizzle-orm";
import { db, client } from "../db";
import { posts, comments } from "../db/schema";
import { formatPost } from "../lib/format";
import type { Env } from "../types";

export const browseRouter = new Hono<Env>();

browseRouter.get("/", async (c) => {
  const workspaceId = c.get("workspaceId");
  const topic = c.req.query("topic") || "";
  const status = c.req.query("status") || "active";
  const recursive = c.req.query("recursive") === "true";
  const orderBy = c.req.query("order_by") || "updated_at";
  const order = c.req.query("order") || "desc";
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50"), 1), 100);
  const cursor = c.req.query("cursor");

  // Build conditions for posts at this exact topic
  const conditions: any[] = [eq(posts.workspaceId, workspaceId)];

  if (recursive) {
    // All posts at and below this topic
    if (topic) {
      conditions.push(
        or(eq(posts.topic, topic), like(posts.topic, `${topic}/%`))
      );
    }
    // If topic is empty and recursive, return all posts (no topic filter)
  } else {
    // Only posts at this exact topic
    conditions.push(eq(posts.topic, topic));
  }

  // Status filter
  if (status !== "all") {
    conditions.push(eq(posts.status, status as "active" | "archived" | "obsolete"));
  }

  // Cursor-based pagination
  if (cursor) {
    const [cursorPost] = await db.select().from(posts).where(eq(posts.id, cursor));
    if (cursorPost) {
      const col = orderBy === "created_at" ? posts.createdAt : orderBy === "title" ? posts.title : posts.updatedAt;
      const rawVal = orderBy === "created_at" ? cursorPost.createdAt : orderBy === "title" ? cursorPost.title : cursorPost.updatedAt;
      const cursorVal = rawVal instanceof Date ? rawVal.toISOString() : rawVal;
      if (order === "desc") {
        conditions.push(sql`(${col} < ${cursorVal} OR (${col} = ${cursorVal} AND ${posts.id} < ${cursor}))`);
      } else {
        conditions.push(sql`(${col} > ${cursorVal} OR (${col} = ${cursorVal} AND ${posts.id} > ${cursor}))`);
      }
    }
  }

  // Build sort
  const sortCol = orderBy === "created_at" ? posts.createdAt : orderBy === "title" ? posts.title : posts.updatedAt;
  const sortDir = order === "desc" ? desc : asc;

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch one extra to detect has_more
  const rows = await db
    .select()
    .from(posts)
    .where(where)
    .orderBy(sortDir(sortCol), sortDir(posts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const resultPosts = hasMore ? rows.slice(0, limit) : rows;

  // Get comment counts for each post
  const postIds = resultPosts.map((p) => p.id);
  const commentCounts = new Map<string, number>();
  if (postIds.length > 0) {
    const counts = await db
      .select({
        postId: comments.postId,
        count: sql<number>`count(*)::int`,
      })
      .from(comments)
      .where(sql`${comments.postId} IN (${sql.join(postIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(comments.postId);
    for (const row of counts) {
      commentCounts.set(row.postId, row.count);
    }
  }

  // Format posts
  const formattedPosts = resultPosts.map((post) => ({
    ...formatPost(post),
    comment_count: commentCounts.get(post.id) || 0,
  }));

  // Build response
  const response: any = {
    path: topic,
    posts: formattedPosts,
  };

  // Subtopics (only in non-recursive mode)
  if (!recursive) {
    response.subtopics = await getSubtopics(workspaceId, topic, status);
  }

  if (hasMore) {
    response.next_cursor = resultPosts[resultPosts.length - 1].id;
    response.has_more = true;
  }

  return c.json(response);
});

async function getSubtopics(
  workspaceId: string,
  parentTopic: string,
  status: string
): Promise<Array<{
  name: string;
  post_count: number;
  contributor_count: number;
  updated_at: string | null;
  tags: string[];
}>> {
  const prefix = parentTopic ? `${parentTopic}/` : "";
  const prefixLen = prefix.length;

  // Build the CTE query with PostgreSQL string functions
  const params: any[] = [prefix + "%", workspaceId, prefixLen];
  let statusCondition = "";
  if (status !== "all") {
    params.push(status);
    statusCondition = `AND status = $${params.length}`;
  }

  const rows = await client.unsafe(`
    WITH child_posts AS (
      SELECT *
      FROM posts
      WHERE topic LIKE $1
      AND workspace_id = $2
      ${statusCondition}
    ),
    immediate_children AS (
      SELECT
        CASE
          WHEN $3 = 0 THEN
            substring(topic from 1 for position('/' in topic || '/') - 1)
          ELSE
            substring(topic from $3 + 1 for position('/' in substring(topic from $3 + 1) || '/') - 1)
        END AS subtopic,
        *
      FROM child_posts
    )
    SELECT
      subtopic,
      count(*)::int as post_count,
      count(DISTINCT author)::int as contributor_count,
      max(updated_at)::text as updated_at,
      string_agg(DISTINCT tags, ',') as all_tags
    FROM immediate_children
    WHERE subtopic != ''
    GROUP BY subtopic
    ORDER BY max(updated_at) DESC
  `, params);

  return rows.map((row: any) => {
    // Parse and dedupe tags from all posts
    const tagSet = new Set<string>();
    if (row.all_tags) {
      for (const tagStr of row.all_tags.split(",")) {
        try {
          const parsed = JSON.parse(tagStr);
          if (Array.isArray(parsed)) {
            parsed.forEach((t: string) => tagSet.add(t));
          }
        } catch {}
      }
    }

    return {
      name: row.subtopic,
      post_count: row.post_count,
      contributor_count: row.contributor_count,
      updated_at: row.updated_at,
      tags: Array.from(tagSet).slice(0, 5),
    };
  });
}
