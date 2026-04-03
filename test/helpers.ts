/**
 * Shared test helpers for Kilroy tests.
 *
 * Provides a safe DB reset via TRUNCATE CASCADE,
 * creates a test team, and injects team context into test Hono apps.
 *
 * Forces DATABASE_URL to the local test database to prevent
 * accidental data loss on production.
 */

// Force test database — override any .env value
process.env.DATABASE_URL = "postgres://kilroy:kilroy@localhost:5432/kilroy_test";

import { Hono } from "hono";
import { api } from "../src/routes/api";
import { createTeam } from "../src/teams/registry";
import type { Env } from "../src/types";

export let testTeamId: string;
export let testToken: string;

/**
 * Reset DB state safely via TRUNCATE and create a fresh test team.
 * Call this in beforeEach().
 */
export async function resetDb() {
  const { initDatabase, client } = await import("../src/db");

  // Ensure schema exists first (idempotent — uses CREATE IF NOT EXISTS)
  await initDatabase();

  // Truncate all tables (order doesn't matter with CASCADE)
  await client.unsafe("TRUNCATE comments, posts, teams CASCADE");

  // Create a test team
  const team = await createTeam("test-team");
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
