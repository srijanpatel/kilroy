import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { db, sqlite } from "../db";
import { posts, comments } from "../db/schema";
import { uuidv7 } from "../lib/uuid";
import { extractFilePaths } from "../lib/files";
import { formatPost } from "../lib/format";

export const postsRouter = new Hono();

// GET /posts/:id — Read a post with all comments
postsRouter.get("/:id", (c) => {
  const postId = c.req.param("id");

  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) {
    return c.json({ error: "Post not found", code: "NOT_FOUND" }, 404);
  }

  const postComments = db
    .select()
    .from(comments)
    .where(eq(comments.postId, postId))
    .orderBy(asc(comments.createdAt))
    .all();

  // Compute contributors
  const contributorSet = new Set<string>();
  if (post.author) contributorSet.add(post.author);
  for (const comment of postComments) {
    if (comment.author) contributorSet.add(comment.author);
  }

  return c.json({
    ...formatPost(post),
    body: post.body,
    contributors: Array.from(contributorSet),
    comments: postComments.map((comment) => ({
      id: comment.id,
      author: comment.author,
      body: comment.body,
      created_at: comment.createdAt,
    })),
  });
});

// POST /posts — Create a new post
postsRouter.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.title || !body.topic || !body.body) {
    return c.json(
      { error: "Missing required fields: title, topic, body", code: "INVALID_INPUT" },
      400
    );
  }

  const now = new Date().toISOString();
  const id = uuidv7();
  const files = extractFilePaths(body.body);

  const post = {
    id,
    title: body.title,
    topic: body.topic,
    status: "active" as const,
    tags: body.tags ? JSON.stringify(body.tags) : null,
    body: body.body,
    author: body.author || null,
    files: files.length > 0 ? JSON.stringify(files) : null,
    commitSha: body.commit_sha || null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(posts).values(post).run();

  // Index in FTS
  sqlite.exec(
    `INSERT INTO posts_fts(post_id, title, body) VALUES ('${id}', '${escapeSql(body.title)}', '${escapeSql(body.body)}')`
  );

  return c.json(
    {
      id: post.id,
      title: post.title,
      topic: post.topic,
      status: post.status,
      tags: body.tags || [],
      author: post.author,
      files,
      commit_sha: post.commitSha,
      created_at: post.createdAt,
      updated_at: post.updatedAt,
    },
    201
  );
});

// POST /posts/:id/comments — Add a comment to a post
postsRouter.post("/:id/comments", async (c) => {
  const postId = c.req.param("id");
  const body = await c.req.json();

  if (!body.body) {
    return c.json(
      { error: "Missing required field: body", code: "INVALID_INPUT" },
      400
    );
  }

  // Check post exists
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) {
    return c.json({ error: "Post not found", code: "NOT_FOUND" }, 404);
  }

  const now = new Date().toISOString();
  const id = uuidv7();

  const comment = {
    id,
    postId,
    body: body.body,
    author: body.author || null,
    createdAt: now,
  };

  db.insert(comments).values(comment).run();

  // Update post's updated_at
  db.update(posts).set({ updatedAt: now }).where(eq(posts.id, postId)).run();

  // Index comment in FTS
  sqlite.exec(
    `INSERT INTO comments_fts(comment_id, post_id, body) VALUES ('${id}', '${postId}', '${escapeSql(body.body)}')`
  );

  return c.json(
    {
      id: comment.id,
      post_id: comment.postId,
      author: comment.author,
      created_at: comment.createdAt,
    },
    201
  );
});

// PATCH /posts/:id — Update post status
postsRouter.patch("/:id", async (c) => {
  const postId = c.req.param("id");
  const body = await c.req.json();

  if (!body.status) {
    return c.json(
      { error: "Missing required field: status", code: "INVALID_INPUT" },
      400
    );
  }

  const validStatuses = ["active", "archived", "obsolete"];
  if (!validStatuses.includes(body.status)) {
    return c.json(
      { error: `Invalid status: ${body.status}. Must be one of: ${validStatuses.join(", ")}`, code: "INVALID_INPUT" },
      400
    );
  }

  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) {
    return c.json({ error: "Post not found", code: "NOT_FOUND" }, 404);
  }

  // Validate transition
  const validTransitions: Record<string, string[]> = {
    active: ["archived", "obsolete"],
    archived: ["active"],
    obsolete: ["active"],
  };

  if (!validTransitions[post.status]?.includes(body.status)) {
    return c.json(
      {
        error: `Invalid transition: ${post.status} -> ${body.status}`,
        code: "INVALID_TRANSITION",
      },
      409
    );
  }

  const now = new Date().toISOString();
  db.update(posts)
    .set({ status: body.status, updatedAt: now })
    .where(eq(posts.id, postId))
    .run();

  return c.json({
    id: post.id,
    title: post.title,
    topic: post.topic,
    status: body.status,
    updated_at: now,
  });
});

// DELETE /posts/:id — Permanently delete a post and all comments
postsRouter.delete("/:id", (c) => {
  const postId = c.req.param("id");

  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) {
    return c.json({ error: "Post not found", code: "NOT_FOUND" }, 404);
  }

  // Delete from FTS indexes
  sqlite.exec(`DELETE FROM posts_fts WHERE post_id = '${escapeSql(postId)}'`);
  sqlite.exec(`DELETE FROM comments_fts WHERE post_id = '${escapeSql(postId)}'`);

  // Delete comments then post (cascade should handle this, but be explicit)
  db.delete(comments).where(eq(comments.postId, postId)).run();
  db.delete(posts).where(eq(posts.id, postId)).run();

  return c.json({ deleted: true, post_id: postId });
});

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}
