import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { statsRouter } from "../src/routes/stats";

async function resetAndSeed() {
  const { initDatabase, client } = await import("../src/db");
  await initDatabase();
  await client.unsafe("TRUNCATE comments, posts, projects, accounts CASCADE");
}

async function seedData() {
  const { client } = await import("../src/db");
  const { createProject } = await import("../src/projects/registry");
  const { uuidv7 } = await import("../src/lib/uuid");

  // Create test accounts
  const accountId = uuidv7();
  await client.unsafe(`
    INSERT INTO accounts (id, slug, display_name, auth_user_id)
    VALUES ('${accountId}', 'stats-test-account', 'Stats Test Account', 'stats-test-user')
  `);

  const proj1 = await createProject(accountId, "stats-test-1");
  const proj2 = await createProject(accountId, "stats-test-2");

  // Create posts
  await client`
    INSERT INTO posts (id, project_id, title, topic, body, author, created_at)
    VALUES
      ('p1', ${proj1.id}, 'Post 1', 'test', 'body', 'alice', now()),
      ('p2', ${proj1.id}, 'Post 2', 'test', 'body', 'bob', now()),
      ('p3', ${proj2.id}, 'Old post', 'test', 'body', 'alice', now() - interval '48 hours')
  `;

  // Create comments
  await client`
    INSERT INTO comments (id, project_id, post_id, body, author, created_at)
    VALUES
      ('c1', ${proj1.id}, 'p1', 'comment', 'charlie', now()),
      ('c2', ${proj2.id}, 'p3', 'old comment', 'alice', now() - interval '48 hours')
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
    expect(data.projects).toBe(0);
    expect(data.writes.total).toBe(0);
    expect(data.writes.last24h).toBe(0);
  });

  it("returns correct counts with seeded data", async () => {
    await seedData();
    const res = await app.request("/_/api/stats");
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.projects).toBe(2);
    expect(data.writes.total).toBe(5); // 3 posts + 2 comments
    expect(data.writes.last24h).toBe(3); // 2 recent posts + 1 recent comment
  });
});
