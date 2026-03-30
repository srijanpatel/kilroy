# Test Migration: Multi-Tenancy

All tests need updating after the multi-tenancy changes. Routes now require `teamId` and `teamSlug` in the Hono context, set by the team auth middleware.

## What broke

Every route handler now calls `c.get("teamId")` to scope queries. Tests that create a bare Hono app and mount the API routes directly will get `undefined` for `teamId`, causing all queries to fail.

## Fix pattern

### 1. Create a test team in setup

Every test file needs to create a team before making API calls:

```typescript
import { createTeam } from "../src/teams/registry";

let testTeamId: string;
let testToken: string;

beforeEach(() => {
  // Drop and recreate tables (existing pattern)
  sqlite.exec("DROP TABLE IF EXISTS comments_fts");
  sqlite.exec("DROP TABLE IF EXISTS posts_fts");
  sqlite.exec("DROP TABLE IF EXISTS comments");
  sqlite.exec("DROP TABLE IF EXISTS posts");
  sqlite.exec("DROP TABLE IF EXISTS teams");
  initDatabase();

  // Create a test team
  const team = createTeam("test-team");
  testTeamId = team.id;
  testToken = team.projectKey;
});
```

### 2. Inject team context into test app

Add a middleware that sets the team context before the API routes:

```typescript
function createApp() {
  const app = new Hono();
  // Inject team context for all requests
  app.use("*", async (c, next) => {
    c.set("teamId", testTeamId);
    c.set("teamSlug", "test-team");
    return next();
  });
  app.route("/api", api);
  return app;
}
```

### 3. File-by-file changes

#### `test/api.test.ts`
- Update `createApp()` to inject team context (pattern above)
- Add team table to the DROP cascade in `beforeEach`
- No changes needed to individual test assertions

#### `test/find.test.ts`
- Same pattern: inject team context middleware
- Add team table cleanup
- The bare `const app = new Hono().route("/api", api)` on line 6 needs to move into a function that adds the middleware

#### `test/mcp.test.ts`
- `createMcpServer()` now requires a `teamId` argument
- Change `createMcpServer()` → `createMcpServer(testTeamId)`
- Create team in `setupMcp()` before creating the MCP server

#### `test/cli.test.ts`
- This is an integration test that spawns a real server
- The server now requires team-prefixed URLs: `http://localhost:7433/<team>/api/...`
- Need to create a team first via `POST /teams`, then use the team slug in all URLs
- `waitForServer` should hit `/teams` or the root, not `/api/browse`
- The CLI `--server` flag value should include the team slug: `http://localhost:7433/test-team`
- Set `KILROY_TOKEN` in the env passed to CLI spawns

### 4. New test files to add

#### `test/teams.test.ts`
- Team creation: valid slug → 201 + returns project_key
- Slug validation: too short, too long, invalid chars, reserved → 400
- Duplicate slug → 409
- Key validation: correct key returns teamId, wrong key returns false
- Join endpoint: valid token sets cookie, invalid token → 401

#### `test/auth.test.ts`
- API routes without auth → 401
- API routes with invalid Bearer token → 401
- API routes with valid Bearer token → 200
- Cookie auth for web UI routes
- Cross-team isolation: team A's token can't access team B's data
