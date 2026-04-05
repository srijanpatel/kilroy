/**
 * Shared test helpers for Kilroy tests.
 *
 * Provides a safe DB reset via TRUNCATE CASCADE,
 * creates a test workspace, and injects workspace context into test Hono apps.
 *
 * Forces DATABASE_URL to the local test database to prevent
 * accidental data loss on production.
 */

// DATABASE_URL is set by test/preload.ts (via bunfig.toml) before any imports.
// Do not override it here.

import { Hono } from "hono";
import { api } from "../src/routes/api";
import { createWorkspace } from "../src/workspaces/registry";
import type { Env } from "../src/types";

export let testWorkspaceId: string;
export let testToken: string;

/**
 * Reset DB state safely via TRUNCATE and create a fresh test workspace.
 * Call this in beforeEach().
 */
export async function resetDb() {
  const { initDatabase, client } = await import("../src/db");

  // Ensure schema exists first (idempotent — uses CREATE IF NOT EXISTS)
  await initDatabase();

  // Truncate all tables (order doesn't matter with CASCADE)
  await client.unsafe("TRUNCATE comments, posts, workspaces CASCADE");

  // Create a test workspace
  const workspace = await createWorkspace("test-workspace");
  testWorkspaceId = workspace.id;
  testToken = workspace.projectKey;
}

/**
 * Create a Hono app with workspace context injected for testing.
 * Routes will see c.get("workspaceId") and c.get("workspaceSlug").
 */
export function createTestApp(): Hono<Env> {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("workspaceId", testWorkspaceId);
    c.set("workspaceSlug", "test-workspace");
    return next();
  });
  app.route("/api", api);
  return app;
}
