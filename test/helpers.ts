/**
 * Shared test helpers for Kilroy tests.
 *
 * Provides a safe DB reset that uses DELETE instead of DROP TABLE,
 * creates a test team, and injects team context into test Hono apps.
 *
 * IMPORTANT: The DB path must be set to ":memory:" via KILROY_DB_PATH
 * env var BEFORE any import of src/db. This file does NOT set it —
 * each test file must set it at the very top before any other imports.
 */

import { Hono } from "hono";
import { api } from "../src/routes/api";
import { createTeam } from "../src/teams/registry";
import type { Env } from "../src/types";

export let testTeamId: string;
export let testToken: string;

/**
 * Reset DB state safely (no DROP TABLE) and create a fresh test team.
 * Call this in beforeEach().
 */
export function resetDb() {
  const { initDatabase, sqlite } = require("../src/db");

  // Delete data, not structure. Order matters for FK constraints.
  sqlite.exec("DELETE FROM comments_fts");
  sqlite.exec("DELETE FROM posts_fts");
  sqlite.exec("DELETE FROM comments");
  sqlite.exec("DELETE FROM posts");
  sqlite.exec("DELETE FROM teams");

  // Ensure schema exists (idempotent — uses CREATE IF NOT EXISTS)
  initDatabase();

  // Create a test team
  const team = createTeam("test-team");
  testTeamId = team.id;
  testToken = team.projectKey;
}

/**
 * Create a Hono app with team context injected for testing.
 * Routes will see c.get("teamId") and c.get("teamSlug").
 */
export function createTestApp(): Hono<Env> {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("teamId", testTeamId);
    c.set("teamSlug", "test-team");
    return next();
  });
  app.route("/api", api);
  return app;
}
