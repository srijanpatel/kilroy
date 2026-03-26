import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { initDatabase, sqlite } from "../src/db";
import { api } from "../src/routes/api";

const app = new Hono().route("/api", api);

function request(path: string) {
  return app.request(`http://localhost/api${path}`);
}

async function createPost(overrides: Record<string, any> = {}) {
  const body = {
    title: "Test post",
    topic: "test",
    body: "test body",
    ...overrides,
  };
  const res = await app.request("http://localhost/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

beforeEach(() => {
  sqlite.exec("DROP TABLE IF EXISTS comments_fts");
  sqlite.exec("DROP TABLE IF EXISTS posts_fts");
  sqlite.exec("DROP TABLE IF EXISTS comments");
  sqlite.exec("DROP TABLE IF EXISTS posts");
  initDatabase();
});

// ─── GET /api/find ────────────────────────────────────────────

describe("GET /api/find", () => {
  it("requires at least one filter", async () => {
    const res = await request("/find");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("INVALID_INPUT");
  });

  it("filters by author", async () => {
    await createPost({ author: "alice", title: "Alice post" });
    await createPost({ author: "bob", title: "Bob post" });

    const res = await request("/find?author=alice");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe("Alice post");
  });

  it("filters by tag", async () => {
    await createPost({ tags: ["gotcha", "auth"], title: "Tagged" });
    await createPost({ tags: ["other"], title: "Other" });

    const res = await request("/find?tag=gotcha");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe("Tagged");
  });

  it("filters by multiple tags (AND)", async () => {
    await createPost({ tags: ["gotcha", "auth"], title: "Both tags" });
    await createPost({ tags: ["gotcha"], title: "One tag" });

    const res = await request("/find?tag=gotcha&tag=auth");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe("Both tags");
  });

  it("filters by since (date)", async () => {
    const old = await createPost({ title: "Old post" });
    // Manually backdate
    sqlite.exec(`UPDATE posts SET updated_at = '2026-01-01T00:00:00Z', created_at = '2026-01-01T00:00:00Z' WHERE id = '${old.id}'`);
    await createPost({ title: "New post" });

    const res = await request("/find?since=2026-03-01");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe("New post");
  });

  it("filters by before (date)", async () => {
    const old = await createPost({ title: "Old post" });
    sqlite.exec(`UPDATE posts SET updated_at = '2026-01-01T00:00:00Z', created_at = '2026-01-01T00:00:00Z' WHERE id = '${old.id}'`);
    await createPost({ title: "New post" });

    const res = await request("/find?before=2026-02-01");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe("Old post");
  });

  it("filters by file", async () => {
    await createPost({ body: "See src/auth/oauth.ts for details", title: "Has file" });
    await createPost({ body: "No files here", title: "No file" });

    const res = await request("/find?file=src/auth/oauth.ts");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe("Has file");
  });

  it("filters by commit", async () => {
    await createPost({ commit_sha: "abc123", title: "With commit" });
    await createPost({ commit_sha: "def456", title: "Other commit" });

    const res = await request("/find?commit=abc123");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe("With commit");
  });

  it("filters by status", async () => {
    const active = await createPost({ title: "Active post", topic: "status-test" });
    const toArchive = await createPost({ title: "Archived post", topic: "status-test" });
    // Archive one post
    await app.request(`http://localhost/api/posts/${toArchive.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });

    // Default (active only)
    const res = await request("/find?topic=status-test");
    const data = await res.json();
    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe("Active post");

    // All statuses
    const res2 = await request("/find?topic=status-test&status=all");
    const data2 = await res2.json();
    expect(data2.results.length).toBe(2);
  });

  it("filters by topic (prefix match)", async () => {
    await createPost({ topic: "auth/google", title: "Auth post" });
    await createPost({ topic: "deploy", title: "Deploy post" });

    const res = await request("/find?topic=auth");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe("Auth post");
  });

  it("combines filters (AND)", async () => {
    await createPost({ author: "alice", tags: ["gotcha"], title: "Match" });
    await createPost({ author: "alice", tags: ["other"], title: "Wrong tag" });
    await createPost({ author: "bob", tags: ["gotcha"], title: "Wrong author" });

    const res = await request("/find?author=alice&tag=gotcha");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe("Match");
  });

  it("supports pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await createPost({ author: "alice", title: `Post ${i}` });
    }

    const res = await request("/find?author=alice&limit=2");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.length).toBe(2);
    expect(data.has_more).toBe(true);
    expect(data.next_cursor).toBeDefined();

    const res2 = await request(`/find?author=alice&limit=2&cursor=${data.next_cursor}`);
    const data2 = await res2.json();
    expect(data2.results.length).toBe(2);
  });

  it("returns post metadata in results", async () => {
    await createPost({ author: "alice", tags: ["gotcha"], title: "Full result", topic: "auth" });

    const res = await request("/find?author=alice");
    const data = await res.json();
    const r = data.results[0];
    expect(r.id).toBeDefined();
    expect(r.title).toBe("Full result");
    expect(r.topic).toBe("auth");
    expect(r.status).toBe("active");
    expect(r.tags).toEqual(["gotcha"]);
    expect(r.author).toBe("alice");
    expect(r.updated_at).toBeDefined();
    expect(r.created_at).toBeDefined();
  });
});
