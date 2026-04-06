import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";

import { resetDb, createTestApp, testWorkspaceId, testToken } from "./helpers";
import { installHandler } from "../src/routes/install";
import type { Env } from "../src/types";

let app: Hono<Env>;

async function setup() {
  await resetDb();
  app = createTestApp();
}

async function createPost(
  overrides: Record<string, any> = {}
): Promise<any> {
  const defaults = {
    title: "Test post",
    topic: "test",
    body: "Test body content",
    tags: ["test"],
    author: "claude-test",
  };
  const res = await app.request("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...defaults, ...overrides }),
  });
  return res.json();
}

async function createComment(
  postId: string,
  overrides: Record<string, any> = {}
): Promise<any> {
  const defaults = {
    body: "Test comment",
    author: "human:sarah",
  };
  const res = await app.request(`/api/posts/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...defaults, ...overrides }),
  });
  return res.json();
}

// ─── GET /api/info ─────────────────────────────────────────────

describe("GET /api/info", () => {
  beforeEach(setup);

  it("returns workspace info with install command and join link", async () => {
    const res = await app.request("/api/info");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.slug).toBe("test-workspace");
    expect(data.install_command).toContain("curl");
    expect(data.install_command).toContain(testToken);
    expect(data.join_link).toContain("/test-workspace/_/join?token=");
    expect(data.join_link).toContain(testToken);
  });
});

// ─── POST /api/posts ───────────────────────────────────────────

describe("POST /api/posts", () => {
  beforeEach(setup);

  it("creates a post with all fields", async () => {
    const res = await app.request("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "OAuth gotcha",
        topic: "auth/google",
        body: "Redirect URI must match exactly.",
        tags: ["oauth", "gotcha"],
        author: "claude-session-abc",
      }),
    });

    expect(res.status).toBe(201);
    const post = await res.json();
    expect(post.id).toMatch(/^[0-9a-f-]+$/);
    expect(post.title).toBe("OAuth gotcha");
    expect(post.topic).toBe("auth/google");
    expect(post.status).toBe("active");
    expect(post.tags).toEqual(["oauth", "gotcha"]);
    expect(post.author).toBe("claude-session-abc");
    expect(post.created_at).toBeTruthy();
    expect(post.updated_at).toBe(post.created_at);
  });

  it("returns 400 when missing required fields", async () => {
    const res = await app.request("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "no body or topic" }),
    });

    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.code).toBe("INVALID_INPUT");
  });

  it("handles posts with no optional fields", async () => {
    const res = await app.request("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Minimal post",
        topic: "misc",
        body: "Just some text with no file paths",
      }),
    });

    expect(res.status).toBe(201);
    const post = await res.json();
    expect(post.tags).toEqual([]);
    expect(post.author).toBeNull();
  });
});

// ─── POST /api/posts/:id/comments ──────────────────────────────

describe("POST /api/posts/:id/comments", () => {
  beforeEach(setup);

  it("creates a comment on an existing post", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Great find!", author: "human:sarah" }),
    });

    expect(res.status).toBe(201);
    const comment = await res.json();
    expect(comment.id).toMatch(/^[0-9a-f-]+$/);
    expect(comment.post_id).toBe(post.id);
    expect(comment.author).toBe("human:sarah");
  });

  it("returns 404 for non-existent post", async () => {
    const res = await app.request("/api/posts/nonexistent/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "test" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 400 when body is missing", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("updates post's updated_at", async () => {
    const post = await createPost();
    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 10));
    await createComment(post.id);

    const readRes = await app.request(`/api/posts/${post.id}`);
    const updated = await readRes.json();
    expect(updated.updated_at).not.toBe(post.created_at);
  });
});

// ─── GET /api/posts/:id ────────────────────────────────────────

describe("GET /api/posts/:id", () => {
  beforeEach(setup);

  it("reads a post with comments and contributors", async () => {
    const post = await createPost({ author: "claude-test" });
    await createComment(post.id, { author: "human:sarah" });
    await createComment(post.id, { author: "claude-test" });

    const res = await app.request(`/api/posts/${post.id}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe(post.title);
    expect(data.body).toBeTruthy();
    expect(data.comments).toHaveLength(2);
    expect(data.comments[0].author).toBe("human:sarah");
    expect(data.contributors).toContain("claude-test");
    expect(data.contributors).toContain("human:sarah");
    expect(data.contributors).toHaveLength(2); // deduped
  });

  it("returns 404 for non-existent post", async () => {
    const res = await app.request("/api/posts/nonexistent");
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/browse ───────────────────────────────────────────

describe("GET /api/browse", () => {
  beforeEach(setup);

  it("lists subtopics and posts at root", async () => {
    await createPost({ topic: "auth", title: "Auth post" });
    await createPost({ topic: "auth/google", title: "Google post" });
    await createPost({ topic: "deployments/staging", title: "Deploy post" });

    const res = await app.request("/api/browse");
    const data = await res.json();

    expect(data.path).toBe("");
    expect(data.posts).toHaveLength(0); // no posts at root
    expect(data.subtopics.map((s: any) => s.name).sort()).toEqual(["auth", "deployments"]);
  });

  it("lists posts at a specific topic", async () => {
    await createPost({ topic: "auth/google", title: "Post A" });
    await createPost({ topic: "auth/google", title: "Post B" });
    await createPost({ topic: "auth/google/creds", title: "Nested" });

    const res = await app.request("/api/browse?topic=auth/google");
    const data = await res.json();

    expect(data.path).toBe("auth/google");
    expect(data.posts).toHaveLength(2);
    expect(data.subtopics).toHaveLength(1);
    expect(data.subtopics[0].name).toBe("creds");
  });

  it("supports recursive mode", async () => {
    await createPost({ topic: "auth", title: "A" });
    await createPost({ topic: "auth/google", title: "B" });
    await createPost({ topic: "auth/google/creds", title: "C" });

    const res = await app.request("/api/browse?topic=auth&recursive=true");
    const data = await res.json();

    expect(data.posts).toHaveLength(3);
    expect(data.subtopics).toBeUndefined();
  });

  it("filters by status", async () => {
    const post = await createPost({ topic: "test", title: "Active" });
    await createPost({ topic: "test", title: "Other" });

    // Archive one
    await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });

    const activeRes = await app.request("/api/browse?topic=test&status=active");
    expect((await activeRes.json()).posts).toHaveLength(1);

    const allRes = await app.request("/api/browse?topic=test&status=all");
    expect((await allRes.json()).posts).toHaveLength(2);
  });

  it("paginates results", async () => {
    for (let i = 0; i < 5; i++) {
      await createPost({ topic: "paginate", title: `Post ${i}` });
    }

    const res1 = await app.request("/api/browse?topic=paginate&limit=2");
    const data1 = await res1.json();
    expect(data1.posts).toHaveLength(2);
    expect(data1.has_more).toBe(true);
    expect(data1.next_cursor).toBeTruthy();

    const res2 = await app.request(
      `/api/browse?topic=paginate&limit=2&cursor=${data1.next_cursor}`
    );
    const data2 = await res2.json();
    expect(data2.posts).toHaveLength(2);

    // Ensure no overlap
    const ids1 = data1.posts.map((p: any) => p.id);
    const ids2 = data2.posts.map((p: any) => p.id);
    expect(ids1.filter((id: string) => ids2.includes(id))).toHaveLength(0);
  });

  it("includes comment counts", async () => {
    const post = await createPost({ topic: "counts" });
    await createComment(post.id);
    await createComment(post.id);

    const res = await app.request("/api/browse?topic=counts");
    const data = await res.json();
    expect(data.posts[0].comment_count).toBe(2);
  });
});

// ─── GET /api/search ───────────────────────────────────────────

describe("GET /api/search", () => {
  beforeEach(setup);

  it("finds posts by content", async () => {
    await createPost({
      title: "Race condition in auth",
      topic: "auth",
      body: "Found a race condition in token refresh",
    });
    await createPost({
      title: "Deploy notes",
      topic: "deploy",
      body: "Standard deployment procedure",
    });

    const res = await app.request("/api/search?query=race+condition");
    const data = await res.json();

    expect(data.results).toHaveLength(1);
    expect(data.results[0].title).toBe("Race condition in auth");
    expect(data.results[0].snippet).toContain("race");
  });

  it("searches comments too", async () => {
    const post = await createPost({
      title: "Auth issue",
      body: "Something broke",
    });
    await createComment(post.id, {
      body: "The root cause is a race condition in the mutex",
    });

    const res = await app.request("/api/search?query=race+condition");
    const data = await res.json();

    expect(data.results).toHaveLength(1);
    expect(data.results[0].match_location).toBe("comment");
  });

  it("filters by topic", async () => {
    await createPost({ topic: "auth", body: "race condition here" });
    await createPost({ topic: "deploy", body: "race condition there" });

    const res = await app.request("/api/search?query=race&topic=auth");
    const data = await res.json();

    expect(data.results).toHaveLength(1);
    expect(data.results[0].topic).toBe("auth");
  });

  it("filters by tags", async () => {
    await createPost({ body: "race condition", tags: ["gotcha"] });
    await createPost({ body: "race condition", tags: ["docs"] });

    const res = await app.request("/api/search?query=race&tags=gotcha");
    const data = await res.json();

    expect(data.results).toHaveLength(1);
    expect(data.results[0].tags).toContain("gotcha");
  });

  it("returns 400 when query is missing", async () => {
    const res = await app.request("/api/search");
    expect(res.status).toBe(400);
  });

  it("returns empty results for no matches", async () => {
    const res = await app.request("/api/search?query=nonexistent+xyz");
    const data = await res.json();
    expect(data.results).toHaveLength(0);
  });
});

// ─── PATCH /api/posts/:id ──────────────────────────────────────

describe("PATCH /api/posts/:id", () => {
  beforeEach(setup);

  it("archives an active post", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("archived");
  });

  it("marks active post as obsolete", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "obsolete" }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("obsolete");
  });

  it("restores archived post to active", async () => {
    const post = await createPost();

    // Archive first
    await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });

    // Restore
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("active");
  });

  it("rejects invalid transition (archived -> obsolete)", async () => {
    const post = await createPost();

    await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });

    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "obsolete" }),
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_TRANSITION");
  });

  it("returns 404 for non-existent post", async () => {
    const res = await app.request("/api/posts/nonexistent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });

    expect(res.status).toBe(404);
  });
});

// ─── PATCH /api/posts/:id (content editing) ────────────────────

describe("PATCH /api/posts/:id (content editing)", () => {
  beforeEach(setup);

  it("updates post title", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated title" }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Updated title");
  });

  it("updates post topic", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "new/topic" }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).topic).toBe("new/topic");
  });

  it("updates tags only", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["new", "tags"] }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).tags).toEqual(["new", "tags"]);
  });

  it("updates FTS index when body changes", async () => {
    const post = await createPost({ body: "unique word xyzabc in this post" });

    await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "completely different content qrstuv" }),
    });

    const oldSearch = await (await app.request("/api/search?query=xyzabc")).json();
    expect(oldSearch.results).toHaveLength(0);

    const newSearch = await (await app.request("/api/search?query=qrstuv")).json();
    expect(newSearch.results).toHaveLength(1);
  });

  it("clears tags with empty array", async () => {
    const post = await createPost({ tags: ["old", "tags"] });
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: [] }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).tags).toEqual([]);
  });

  it("updates status and content together", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New", status: "archived" }),
    });

    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.title).toBe("New");
    expect(updated.status).toBe("archived");
  });

  it("rejects when no fields provided", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_INPUT");
  });

  it("rejects empty string for title", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_INPUT");
  });

  it("rejects empty string for body", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "" }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_INPUT");
  });

  it("allows editing posts in any status", async () => {
    const post = await createPost();

    // Archive the post
    await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });

    // Edit title on archived post
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Edited while archived" }),
    });

    expect(res.status).toBe(200);
  });

  it("returns full post shape in response", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Full shape check" }),
    });

    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.id).toBeTruthy();
    expect(updated.title).toBeTruthy();
    expect(updated.topic).toBeTruthy();
    expect(updated.status).toBeTruthy();
    expect(updated.tags).toBeDefined();
    expect(updated.author).toBeDefined();
    expect(updated.created_at).toBeTruthy();
    expect(updated.updated_at).toBeTruthy();
  });

  it("rejects content update with invalid status transition", async () => {
    const post = await createPost();

    // Archive the post first
    await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });

    // Try to change title and do invalid transition (archived -> obsolete)
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New", status: "obsolete" }),
    });

    expect(res.status).toBe(409);

    // Verify title was NOT changed (atomic rejection)
    const readRes = await app.request(`/api/posts/${post.id}`);
    const readPost = await readRes.json();
    expect(readPost.title).not.toBe("New");
  });
});

// ─── PATCH /api/posts/:id (author matching) ─────────────────────

describe("PATCH /api/posts/:id (author matching)", () => {
  beforeEach(setup);

  it("allows edit when author matches", async () => {
    const post = await createPost({ author: "claude-session-1" });
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Edited by same author", author: "claude-session-1" }),
    });

    expect(res.status).toBe(200);
  });

  it("rejects edit when author does not match", async () => {
    const post = await createPost({ author: "claude-session-1" });
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Edited by different author", author: "claude-session-2" }),
    });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("AUTHOR_MISMATCH");
  });

  it("allows edit when author is omitted (human escape hatch)", async () => {
    const post = await createPost({ author: "claude-session-1" });
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Edited without author field" }),
    });

    expect(res.status).toBe(200);
  });
});

// ─── PATCH /api/posts/:id/comments/:commentId ──────────────────

describe("PATCH /api/posts/:id/comments/:commentId", () => {
  beforeEach(setup);

  it("updates a comment body", async () => {
    const post = await createPost();
    const comment = await createComment(post.id, { author: "human:sarah" });
    const res = await app.request(`/api/posts/${post.id}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Updated comment body", author: "human:sarah" }),
    });

    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.id).toBeTruthy();
    expect(updated.post_id).toBe(post.id);
    expect(updated.body).toBe("Updated comment body");
    expect(updated.author).toBe("human:sarah");
    expect(updated.created_at).toBeTruthy();
    expect(updated.updated_at).toBeTruthy();
  });

  it("updates parent post's updated_at", async () => {
    const post = await createPost();
    const comment = await createComment(post.id);
    await new Promise((r) => setTimeout(r, 10));

    await app.request(`/api/posts/${post.id}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Updated body" }),
    });

    const readRes = await app.request(`/api/posts/${post.id}`);
    const updatedPost = await readRes.json();
    expect(updatedPost.updated_at).not.toBe(post.updated_at);
  });

  it("updates FTS index for comment", async () => {
    const post = await createPost({ body: "unrelated" });
    const comment = await createComment(post.id, { body: "xyzabc unique word here" });

    await app.request(`/api/posts/${post.id}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "qrstuv replaced content" }),
    });

    const oldSearch = await (await app.request("/api/search?query=xyzabc")).json();
    expect(oldSearch.results).toHaveLength(0);

    const newSearch = await (await app.request("/api/search?query=qrstuv")).json();
    expect(newSearch.results).toHaveLength(1);
  });

  it("rejects when author does not match", async () => {
    const post = await createPost();
    const comment = await createComment(post.id, { author: "human:sarah" });
    const res = await app.request(`/api/posts/${post.id}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Updated body", author: "human:bob" }),
    });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("AUTHOR_MISMATCH");
  });

  it("allows edit when author omitted (human escape hatch)", async () => {
    const post = await createPost();
    const comment = await createComment(post.id, { author: "human:sarah" });
    const res = await app.request(`/api/posts/${post.id}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Updated without author" }),
    });

    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent comment", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}/comments/nonexistent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Updated body" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 when comment belongs to different post", async () => {
    const post1 = await createPost();
    const post2 = await createPost();
    const comment = await createComment(post1.id);

    const res = await app.request(`/api/posts/${post2.id}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Updated body" }),
    });

    expect(res.status).toBe(404);
  });

  it("rejects empty body", async () => {
    const post = await createPost();
    const comment = await createComment(post.id);
    const res = await app.request(`/api/posts/${post.id}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "" }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_INPUT");
  });
});

// ─── DELETE /api/posts/:id ─────────────────────────────────────

describe("DELETE /api/posts/:id", () => {
  beforeEach(setup);

  it("deletes a post and its comments", async () => {
    const post = await createPost();
    await createComment(post.id);

    const res = await app.request(`/api/posts/${post.id}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);

    // Verify post is gone
    const readRes = await app.request(`/api/posts/${post.id}`);
    expect(readRes.status).toBe(404);
  });

  it("removes deleted posts from search", async () => {
    const post = await createPost({
      body: "unique searchable content xyzabc",
    });

    // Verify it's searchable
    const before = await (
      await app.request("/api/search?query=xyzabc")
    ).json();
    expect(before.results).toHaveLength(1);

    // Delete
    await app.request(`/api/posts/${post.id}`, { method: "DELETE" });

    // Verify it's gone from search
    const after = await (
      await app.request("/api/search?query=xyzabc")
    ).json();
    expect(after.results).toHaveLength(0);
  });

  it("returns 404 for non-existent post", async () => {
    const res = await app.request("/api/posts/nonexistent", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

// ─── GET /:workspace/_/install ─────────────────────────────────────

describe("GET /:workspace/_/install", () => {
  beforeEach(setup);

  function installApp() {
    const a = new Hono();
    a.route("/test-workspace/_/install", installHandler);
    return a;
  }

  it("returns a shell script when token is valid", async () => {
    const a = installApp();
    const res = await a.request(`/test-workspace/_/install?token=${testToken}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("#!/usr/bin/env sh");
    expect(body).toContain("claude plugin");
    expect(body).toContain("settings.local.json");
    expect(body).toContain(testToken);
  });

  it("returns 400 when token is missing", async () => {
    const a = installApp();
    const res = await a.request("/test-workspace/_/install");
    expect(res.status).toBe(400);
  });

  it("returns 401 when token is invalid", async () => {
    const a = installApp();
    const res = await a.request("/test-workspace/_/install?token=bad_token");
    expect(res.status).toBe(401);
  });
});
