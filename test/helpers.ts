/**
 * Shared test helpers for Kilroy tests.
 *
 * Provides a safe DB reset via TRUNCATE CASCADE,
 * creates a test account and project, and injects project context into test Hono apps.
 *
 * Forces DATABASE_URL to the local test database to prevent
 * accidental data loss on production.
 */

// DATABASE_URL is set by test/preload.ts (via bunfig.toml) before any imports.
// Do not override it here.

import { Hono } from "hono";
import { api } from "../src/routes/api";
import { createProject } from "../src/projects/registry";
import { uuidv7 } from "../src/lib/uuid";
import type { Env } from "../src/types";

export let testProjectId: string;
export let testToken: string;

/** @deprecated Use testProjectId */
export let testWorkspaceId: string;

/**
 * Reset DB state safely via TRUNCATE and create a fresh test account and project.
 * Call this in beforeEach().
 */
export async function resetDb() {
  const { initDatabase, client } = await import("../src/db");

  // Ensure schema exists first (idempotent — uses CREATE IF NOT EXISTS)
  await initDatabase();

  // Truncate all tables (order doesn't matter with CASCADE)
  await client.unsafe("TRUNCATE comments, posts, projects, accounts CASCADE");

  // Create a test account
  const accountId = uuidv7();
  await client.unsafe(`
    INSERT INTO accounts (id, slug, display_name, auth_user_id)
    VALUES ('${accountId}', 'test-account', 'Test Account', 'test-user-id')
  `);

  // Create a test project
  const project = await createProject(accountId, "test-workspace");
  testProjectId = project.id;
  testWorkspaceId = project.id; // backward compat alias
  testToken = project.projectKey;
}

/**
 * Create a Hono app with project context injected for testing.
 * Routes will see c.get("projectId"), c.get("projectSlug"), and c.get("accountSlug").
 */
export function createTestApp(): Hono<Env> {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("projectId", testProjectId);
    c.set("projectSlug", "test-workspace");
    c.set("accountSlug", "test-account");
    return next();
  });
  app.route("/api", api);
  return app;
}
