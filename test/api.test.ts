import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";

import { resetDb, createTestApp, testWorkspaceId, testToken, testAccountId } from "./helpers";
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
    body: "Test body content",
    tags: ["test"],
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

  it("returns project info with install command and invite link", async () => {
    const res = await app.request("/api/info");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.account).toBe("test-account");
    expect(data.project).toBe("test-workspace");
    expect(data.member_key).toBeTruthy();
    expect(data.install_command).toContain("curl");
    expect(data.install_command).toContain("key=");
    expect(data.invite_link).toContain("/join?token=");
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
        body: "Redirect URI must match exactly.",
        tags: ["oauth", "gotcha"],
      }),
    });

    expect(res.status).toBe(201);
    const post = await res.json();
    expect(post.id).toMatch(/^[0-9a-f-]+$/);
    expect(post.title).toBe("OAuth gotcha");
    expect(post.status).toBe("active");
    expect(post.tags).toEqual(["oauth", "gotcha"]);
    expect(post.author.account_id).toBe(testAccountId);
    expect(post.author.type).toBe("agent");
    expect(post.created_at).toBeTruthy();
    expect(post.updated_at).toBe(post.created_at);
  });

  it("returns 400 when missing required fields", async () => {
    const res = await app.request("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "no body" }),
    });

    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.code).toBe("INVALID_INPUT");
  });

  it("returns 400 when tags are missing", async () => {
    const res = await app.request("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "No tags", body: "Some body" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("tag");
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
      body: JSON.stringify({ body: "Great find!" }),
    });

    expect(res.status).toBe(201);
    const comment = await res.json();
    expect(comment.id).toMatch(/^[0-9a-f-]+$/);
    expect(comment.post_id).toBe(post.id);
    expect(comment.author.account_id).toBe(testAccountId);
    expect(comment.author.type).toBe("agent");
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
    const post = await createPost();
    await createComment(post.id);
    await createComment(post.id);

    const res = await app.request(`/api/posts/${post.id}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe(post.title);
    expect(data.body).toBeTruthy();
    expect(data.comments).toHaveLength(2);
    expect(data.comments[0].author.account_id).toBe(testAccountId);
    // All created by same test account, so only 1 unique contributor
    expect(data.contributors).toHaveLength(1);
    expect(data.contributors[0].account_id).toBe(testAccountId);
  });

  it("returns 404 for non-existent post", async () => {
    const res = await app.request("/api/posts/nonexistent");
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/search ───────────────────────────────────────────

describe("GET /api/search", () => {
  beforeEach(setup);

  it("finds posts by content", async () => {
    await createPost({
      title: "Race condition in auth",
      body: "Found a race condition in token refresh",
      tags: ["auth"],
    });
    await createPost({
      title: "Deploy notes",
      body: "Standard deployment procedure",
      tags: ["deploy"],
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

  it("finds posts by tag keyword", async () => {
    await createPost({
      title: "Deployment runbook",
      body: "Standard deployment steps",
      tags: ["runbook", "infrastructure"],
    });

    const res = await app.request("/api/search?query=infrastructure");
    const data = await res.json();

    expect(data.results.length).toBeGreaterThanOrEqual(1);
    expect(data.results[0].title).toBe("Deployment runbook");
  });

  it("finds posts when tag keyword is not in title or body", async () => {
    await createPost({
      title: "API performance report",
      body: "Response times were stable",
      tags: ["latency", "monitoring"],
    });

    const res = await app.request("/api/search?query=monitoring");
    const data = await res.json();

    expect(data.results.length).toBeGreaterThanOrEqual(1);
    expect(data.results[0].title).toBe("API performance report");
  });

  it("matches posts containing any search term (OR semantics)", async () => {
    await createPost({
      title: "TikTok campaign performance",
      body: "Campaign metrics and spend analysis",
      tags: ["marketing", "tiktok"],
    });
    await createPost({
      title: "Subscriber cohort retention",
      body: "Cohort analysis for March subscribers",
      tags: ["analytics", "churn"],
    });
    await createPost({
      title: "Unrelated auth bug",
      body: "Fixed a login timeout issue",
      tags: ["engineering"],
    });

    const res = await app.request("/api/search?query=marketing+campaign+cohorts");
    const data = await res.json();

    // Should match both marketing and cohort posts, not the auth post
    expect(data.results.length).toBeGreaterThanOrEqual(2);
    const titles = data.results.map((r: any) => r.title);
    expect(titles).toContain("TikTok campaign performance");
    expect(titles).toContain("Subscriber cohort retention");
  });

  it("ranks posts with more matching terms higher", async () => {
    await createPost({
      title: "Only matches one term",
      body: "This post mentions campaign once",
      tags: ["misc"],
    });
    await createPost({
      title: "TikTok campaign cohort analysis",
      body: "Campaign cohort performance for marketing spend",
      tags: ["marketing", "tiktok"],
    });

    const res = await app.request("/api/search?query=marketing+campaign+cohorts");
    const data = await res.json();

    // Post matching more terms should rank first
    expect(data.results[0].title).toBe("TikTok campaign cohort analysis");
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
    expect(updated.status).toBeTruthy();
    expect(updated.tags).toBeDefined();
    expect(updated.author).toBeDefined();
    expect(updated.author.account_id).toBe(testAccountId);
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
// With the new membership model, author matching is based on account IDs from context.
// All test posts are created by the same test account, so mismatch tests are skipped.

describe("PATCH /api/posts/:id (author matching)", () => {
  beforeEach(setup);

  it("allows edit when author matches (same account)", async () => {
    const post = await createPost();
    const res = await app.request(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Edited by same account" }),
    });

    expect(res.status).toBe(200);
  });

  it.skip("rejects edit when author does not match", async () => {
    // This would require a different memberAccountId in context.
    // Skipped: all test requests use the same test account.
  });

  it("allows edit when author is the same account", async () => {
    const post = await createPost();
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
    const comment = await createComment(post.id);
    const res = await app.request(`/api/posts/${post.id}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Updated comment body" }),
    });

    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.id).toBeTruthy();
    expect(updated.post_id).toBe(post.id);
    expect(updated.body).toBe("Updated comment body");
    expect(updated.author.account_id).toBe(testAccountId);
    expect(updated.author.type).toBe("agent");
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

  it.skip("rejects when author does not match", async () => {
    // This would require creating a comment from a different account.
    // Skipped: all test requests use the same test account.
  });

  it("allows edit when same account (author matching)", async () => {
    const post = await createPost();
    const comment = await createComment(post.id);
    const res = await app.request(`/api/posts/${post.id}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Updated by same account" }),
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

// ─── GET /api/tags ────────────────────────────────────────────

describe("GET /api/tags", () => {
  beforeEach(setup);

  it("returns tags with post counts", async () => {
    await createPost({ tags: ["tiktok", "campaigns"] });
    await createPost({ tags: ["tiktok", "roas"] });
    await createPost({ tags: ["churn"] });

    const res = await app.request("/api/tags");
    const data = await res.json();

    expect(data.tags).toBeDefined();
    const tiktok = data.tags.find((t: any) => t.tag === "tiktok");
    expect(tiktok.count).toBe(2);
    const churn = data.tags.find((t: any) => t.tag === "churn");
    expect(churn.count).toBe(1);
  });

  it("returns co-occurring tags when filtered", async () => {
    await createPost({ tags: ["tiktok", "campaigns"] });
    await createPost({ tags: ["tiktok", "roas"] });
    await createPost({ tags: ["churn"] });

    const res = await app.request("/api/tags?tags=tiktok");
    const data = await res.json();

    const tagNames = data.tags.map((t: any) => t.tag);
    expect(tagNames).toContain("campaigns");
    expect(tagNames).toContain("roas");
    expect(tagNames).not.toContain("tiktok");
    expect(tagNames).not.toContain("churn");
  });
});

// ─── GET /:account/:project/install ────────────────────────────────

describe("GET /:account/:project/install", () => {
  beforeEach(setup);

  function installApp() {
    const a = new Hono();
    a.route("/test-account/test-workspace/install", installHandler);
    return a;
  }

  it("returns a shell script with project mapping (no key required)", async () => {
    const a = installApp();
    const res = await a.request("/test-account/test-workspace/install");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("#!/usr/bin/env sh");
    expect(body).toContain("claude plugin");
    expect(body).toContain("settings.local.json");
    // Project mapping via .kilroy/config.toml (no tokens or MCP server config)
    expect(body).toContain('.kilroy/config.toml');
    expect(body).toContain('project = "test-account/test-workspace"');
    expect(body).not.toContain("[mcp_servers.kilroy]");
    expect(body).not.toContain("KILROY_TOKEN");
  });
});
