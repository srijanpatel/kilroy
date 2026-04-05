import { Hono } from "hono";
import { eq, and, asc } from "drizzle-orm";
import { db } from "../db";
import { posts, comments } from "../db/schema";
import { uuidv7 } from "../lib/uuid";
import { formatPost } from "../lib/format";
import type { Env } from "../types";

export const postsRouter = new Hono<Env>();

// GET /posts/:id — Read a post with all comments
postsRouter.get("/:id", async (c) => {
  const postId = c.req.param("id");
  const workspaceId = c.get("workspaceId");

  const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, workspaceId)));
  if (!post) {
    return c.json({ error: "Post not found", code: "NOT_FOUND" }, 404);
  }

  const postComments = await db
    .select()
    .from(comments)
    .where(eq(comments.postId, postId))
    .orderBy(asc(comments.createdAt));

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
      created_at: comment.createdAt.toISOString(),
      updated_at: comment.updatedAt.toISOString(),
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

  const workspaceId = c.get("workspaceId");
  const now = new Date();
  const id = uuidv7();

  const post = {
    id,
    workspaceId,
    title: body.title,
    topic: body.topic,
    status: "active" as const,
    tags: body.tags ? JSON.stringify(body.tags) : null,
    body: body.body,
    author: body.author || null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(posts).values(post);

  // FTS search_vector is updated automatically by database trigger

  return c.json(
    {
      id: post.id,
      title: post.title,
      topic: post.topic,
      status: post.status,
      tags: body.tags || [],
      author: post.author,
      created_at: post.createdAt.toISOString(),
      updated_at: post.updatedAt.toISOString(),
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

  const workspaceId = c.get("workspaceId");

  // Check post exists and belongs to this workspace
  const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, workspaceId)));
  if (!post) {
    return c.json({ error: "Post not found", code: "NOT_FOUND" }, 404);
  }

  const now = new Date();
  const id = uuidv7();

  const comment = {
    id,
    workspaceId,
    postId,
    body: body.body,
    author: body.author || null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(comments).values(comment);

  // Update post's updated_at
  await db.update(posts).set({ updatedAt: now }).where(eq(posts.id, postId));

  // FTS search_vector is updated automatically by database trigger

  return c.json(
    {
      id: comment.id,
      post_id: comment.postId,
      author: comment.author,
      created_at: comment.createdAt.toISOString(),
      updated_at: comment.updatedAt.toISOString(),
    },
    201
  );
});

// PATCH /posts/:id/comments/:commentId — Update a comment
postsRouter.patch("/:id/comments/:commentId", async (c) => {
  const postId = c.req.param("id");
  const commentId = c.req.param("commentId");
  const body = await c.req.json();

  if (!body.body || typeof body.body !== "string" || body.body.length === 0) {
    return c.json(
      { error: "Field 'body' is required and must be a non-empty string", code: "INVALID_INPUT" },
      400
    );
  }

  const workspaceId = c.get("workspaceId");

  // Find the comment and verify it belongs to this post and workspace
  const [comment] = await db.select().from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.workspaceId, workspaceId)));

  if (!comment || comment.postId !== postId) {
    return c.json({ error: "Comment not found", code: "NOT_FOUND" }, 404);
  }

  // Author matching
  if (body.author && body.author !== comment.author) {
    return c.json(
      { error: "You can only edit your own comments", code: "AUTHOR_MISMATCH" },
      403
    );
  }

  const now = new Date();

  // Update comment (trigger auto-updates search_vector)
  await db.update(comments)
    .set({ body: body.body, updatedAt: now })
    .where(eq(comments.id, commentId));

  // Update parent post's updated_at
  await db.update(posts).set({ updatedAt: now }).where(eq(posts.id, postId));

  return c.json({
    id: commentId,
    post_id: postId,
    body: body.body,
    author: comment.author,
    created_at: comment.createdAt.toISOString(),
    updated_at: now.toISOString(),
  });
});

// PATCH /posts/:id — Update post content and/or status
postsRouter.patch("/:id", async (c) => {
  const postId = c.req.param("id");
  const body = await c.req.json();

  const hasContent = body.title !== undefined || body.topic !== undefined ||
    body.body !== undefined || body.tags !== undefined;
  const hasStatus = body.status !== undefined;

  if (!hasContent && !hasStatus) {
    return c.json(
      { error: "At least one field required: title, topic, body, tags, or status", code: "INVALID_INPUT" },
      400
    );
  }

  // Validate non-empty strings for text fields
  for (const field of ["title", "topic", "body"] as const) {
    if (body[field] !== undefined && (typeof body[field] !== "string" || body[field].length === 0)) {
      return c.json(
        { error: `Field '${field}' must be a non-empty string`, code: "INVALID_INPUT" },
        400
      );
    }
  }

  // Validate status enum if provided
  const validStatuses = ["active", "archived", "obsolete"];
  if (hasStatus && !validStatuses.includes(body.status)) {
    return c.json(
      { error: `Invalid status: ${body.status}. Must be one of: ${validStatuses.join(", ")}`, code: "INVALID_INPUT" },
      400
    );
  }

  const workspaceId = c.get("workspaceId");
  const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, workspaceId)));
  if (!post) {
    return c.json({ error: "Post not found", code: "NOT_FOUND" }, 404);
  }

  // Author matching: if author provided, must match stored author
  if (body.author && body.author !== post.author) {
    return c.json(
      { error: "You can only edit your own posts", code: "AUTHOR_MISMATCH" },
      403
    );
  }

  // Validate status transition if status is being changed
  if (hasStatus && body.status !== post.status) {
    const validTransitions: Record<string, string[]> = {
      active: ["archived", "obsolete"],
      archived: ["active"],
      obsolete: ["active"],
    };

    if (!validTransitions[post.status]?.includes(body.status)) {
      return c.json(
        { error: `Invalid transition: ${post.status} -> ${body.status}`, code: "INVALID_TRANSITION" },
        409
      );
    }
  }

  // Build update set
  const now = new Date();
  const updates: Record<string, any> = { updatedAt: now };

  if (body.title !== undefined) updates.title = body.title;
  if (body.topic !== undefined) updates.topic = body.topic;
  if (body.body !== undefined) updates.body = body.body;
  if (body.tags !== undefined) updates.tags = body.tags.length > 0 ? JSON.stringify(body.tags) : null;
  if (hasStatus) updates.status = body.status;

  // Trigger auto-updates search_vector when title or body changes
  await db.update(posts).set(updates).where(eq(posts.id, postId));

  // Read back the full post for response
  const [updated] = await db.select().from(posts).where(eq(posts.id, postId));
  return c.json(formatPost(updated));
});

// DELETE /posts/:id — Permanently delete a post and all comments
postsRouter.delete("/:id", async (c) => {
  const postId = c.req.param("id");

  const workspaceId = c.get("workspaceId");
  const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, workspaceId)));
  if (!post) {
    return c.json({ error: "Post not found", code: "NOT_FOUND" }, 404);
  }

  // Delete comments then post (cascade should handle this, but be explicit)
  await db.delete(comments).where(eq(comments.postId, postId));
  await db.delete(posts).where(eq(posts.id, postId));

  return c.json({ deleted: true, post_id: postId });
});
