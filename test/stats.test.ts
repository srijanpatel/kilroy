import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { statsRouter } from "../src/routes/stats";

async function resetAndSeed() {
  const { initDatabase, client } = await import("../src/db");
  await initDatabase();
  await client.unsafe("TRUNCATE comments, posts, workspaces CASCADE");
}

async function seedData() {
  const { client } = await import("../src/db");
  const { createWorkspace } = await import("../src/workspaces/registry");

  const ws1 = await createWorkspace("stats-test-1");
  const ws2 = await createWorkspace("stats-test-2");

  // Create posts
  await client`
    INSERT INTO posts (id, workspace_id, title, topic, body, author, created_at)
    VALUES
      ('p1', ${ws1.id}, 'Post 1', 'test', 'body', 'alice', now()),
      ('p2', ${ws1.id}, 'Post 2', 'test', 'body', 'bob', now()),
      ('p3', ${ws2.id}, 'Old post', 'test', 'body', 'alice', now() - interval '48 hours')
  `;

  // Create comments
  await client`
    INSERT INTO comments (id, workspace_id, post_id, body, author, created_at)
    VALUES
      ('c1', ${ws1.id}, 'p1', 'comment', 'charlie', now()),
      ('c2', ${ws2.id}, 'p3', 'old comment', 'alice', now() - interval '48 hours')
  `;
}

describe("GET /_/api/stats", () => {
  let app: Hono;

  beforeEach(async () => {
    await resetAndSeed();
    app = new Hono();
    app.route("/_/api", statsRouter);
  });

  it("returns zeros when empty", async () => {
    const res = await app.request("/_/api/stats");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.workspaces).toBe(0);
    expect(data.writes.total).toBe(0);
    expect(data.writes.last24h).toBe(0);
  });

  it("returns correct counts with seeded data", async () => {
    await seedData();
    const res = await app.request("/_/api/stats");
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.workspaces).toBe(2);
    expect(data.writes.total).toBe(5); // 3 posts + 2 comments
    expect(data.writes.last24h).toBe(3); // 2 recent posts + 1 recent comment
  });
});
