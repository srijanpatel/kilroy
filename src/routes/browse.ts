import { Hono } from "hono";
import { eq, and, like, or, sql, desc, asc } from "drizzle-orm";
import { db } from "../db";
import { posts, comments } from "../db/schema";
import { formatPost } from "../lib/format";

export const browseRouter = new Hono();

browseRouter.get("/", (c) => {
  const topic = c.req.query("topic") || "";
  const status = c.req.query("status") || "active";
  const recursive = c.req.query("recursive") === "true";
  const orderBy = c.req.query("order_by") || "updated_at";
  const order = c.req.query("order") || "desc";
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50"), 1), 100);
  const cursor = c.req.query("cursor");

  // Build conditions for posts at this exact topic
  const conditions: any[] = [];

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
    conditions.push(eq(posts.status, status));
  }

  // Cursor-based pagination
  if (cursor) {
    const cursorPost = db.select().from(posts).where(eq(posts.id, cursor)).get();
    if (cursorPost) {
      const col = orderBy === "created_at" ? posts.createdAt : orderBy === "title" ? posts.title : posts.updatedAt;
      const cursorVal = orderBy === "created_at" ? cursorPost.createdAt : orderBy === "title" ? cursorPost.title : cursorPost.updatedAt;
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
  const rows = db
    .select()
    .from(posts)
    .where(where)
    .orderBy(sortDir(sortCol), sortDir(posts.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const resultPosts = hasMore ? rows.slice(0, limit) : rows;

  // Get comment counts for each post
  const postIds = resultPosts.map((p) => p.id);
  const commentCounts = new Map<string, number>();
  if (postIds.length > 0) {
    const counts = db
      .select({
        postId: comments.postId,
        count: sql<number>`count(*)`,
      })
      .from(comments)
      .where(sql`${comments.postId} IN (${sql.join(postIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(comments.postId)
      .all();
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
    response.subtopics = getSubtopics(topic, status);
  }

  if (hasMore) {
    response.next_cursor = resultPosts[resultPosts.length - 1].id;
    response.has_more = true;
  }

  return c.json(response);
});

function getSubtopics(
  parentTopic: string,
  status: string
): Array<{
  name: string;
  post_count: number;
  contributor_count: number;
  updated_at: string | null;
  tags: string[];
}> {
  const prefix = parentTopic ? `${parentTopic}/` : "";
  const statusFilter = status !== "all" ? `AND status = '${status}'` : "";

  // Get all unique immediate child topic segments
  const rows = db.all<{
    subtopic: string;
    post_count: number;
    contributor_count: number;
    updated_at: string;
    all_tags: string;
  }>(sql`
    WITH child_posts AS (
      SELECT *
      FROM posts
      WHERE topic LIKE ${prefix + "%"}
      ${sql.raw(statusFilter)}
    ),
    immediate_children AS (
      SELECT
        CASE
          WHEN ${prefix} = '' THEN
            substr(topic, 1, instr(topic || '/', '/') - 1)
          ELSE
            substr(topic, ${prefix.length + 1}, instr(substr(topic, ${prefix.length + 1}) || '/', '/') - 1)
        END AS subtopic,
        *
      FROM child_posts
    )
    SELECT
      subtopic,
      count(*) as post_count,
      count(DISTINCT author) as contributor_count,
      max(updated_at) as updated_at,
      group_concat(DISTINCT tags) as all_tags
    FROM immediate_children
    WHERE subtopic != '' AND subtopic != topic
    GROUP BY subtopic
    ORDER BY max(updated_at) DESC
  `);

  return rows.map((row) => {
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
