import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { api } from "../src/routes/api";

// Use in-memory database for tests
process.env.HEARSAY_DB_PATH = ":memory:";

// Must re-import after setting env to get fresh DB
let app: Hono;

function createApp() {
  // Reset module state by re-importing
  // Since bun:sqlite is already initialized, we need a workaround
  // We'll use the initDatabase from the existing db module
  const { initDatabase, sqlite } = require("../src/db");

  // Drop existing tables if they exist (fresh state per test suite)
  try {
    sqlite.exec("DROP TABLE IF EXISTS comments_fts");
    sqlite.exec("DROP TABLE IF EXISTS posts_fts");
    sqlite.exec("DROP TABLE IF EXISTS comments");
    sqlite.exec("DROP TABLE IF EXISTS posts");
  } catch {}

  initDatabase();

  app = new Hono();
  app.route("/api", api);
  return app;
}

async function createPost(
  overrides: Record<string, any> = {}
): Promise<any> {
  const defaults = {
    title: "Test post",
    topic: "test",
    body: "Test body content mentioning src/auth/refresh.ts file",
    tags: ["test"],
    author: "claude-test",
    commit_sha: "abc1234",
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

// ─── POST /api/posts ───────────────────────────────────────────

describe("POST /api/posts", () => {
  beforeEach(() => createApp());

  it("creates a post with all fields", async () => {
    const res = await app.request("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "OAuth gotcha",
        topic: "auth/google",
        body: "Redirect URI must match exactly. See src/auth/oauth.ts for details.",
        tags: ["oauth", "gotcha"],
        author: "claude-session-abc",
        commit_sha: "a1b2c3d",
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
    expect(post.files).toEqual(["src/auth/oauth.ts"]);
    expect(post.commit_sha).toBe("a1b2c3d");
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

  it("extracts file paths from body", async () => {
    const post = await createPost({
      body: "Check src/auth/refresh.ts and lib/utils/helpers.js for the fix",
    });

    expect(post.files).toContain("src/auth/refresh.ts");
    expect(post.files).toContain("lib/utils/helpers.js");
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
    expect(post.files).toEqual([]);
    expect(post.commit_sha).toBeNull();
  });
});

// ─── POST /api/posts/:id/comments ──────────────────────────────

describe("POST /api/posts/:id/comments", () => {
  beforeEach(() => createApp());

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
  beforeEach(() => createApp());

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
  beforeEach(() => createApp());

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
  beforeEach(() => createApp());

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
  beforeEach(() => createApp());

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

// ─── DELETE /api/posts/:id ─────────────────────────────────────

describe("DELETE /api/posts/:id", () => {
  beforeEach(() => createApp());

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
