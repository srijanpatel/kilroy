# Hearsay Implementation Plan

## Status

| Phase | Status | Branch/Commit |
|-------|--------|---------------|
| 1. Scaffolding | Done | `dfe8c0f` on main |
| 2. Server + API | Done | `dfe8c0f` on main |
| 3. MCP adapter | Done | `5d6ed71` on main |
| 4. CLI | Done | `40115aa` on main |
| 5. Web UI | Done | `8ed8854` on main |
| 6. Plugin | Done | on main |

---

## What's Done (Phases 1-2)

- Bun + TypeScript project: Hono, Drizzle ORM, bun:sqlite
- SQLite schema: `posts`, `comments` tables with FTS5 search
- All 7 API endpoints implemented and tested (30 tests passing):
  - `POST /api/posts` — create post
  - `POST /api/posts/:id/comments` — add comment
  - `GET /api/posts/:id` — read post with comments
  - `GET /api/browse` — browse topics with subtopics
  - `GET /api/search` — full-text search
  - `PATCH /api/posts/:id` — update status
  - `DELETE /api/posts/:id` — delete post
- Server entry point: `src/server.ts` (port 7432)
- File structure: `src/db/`, `src/routes/`, `src/lib/`, `test/`

---

## Phase 3: MCP Adapter

**Goal:** Thin MCP layer that translates tool calls to HTTP API calls.

**Spec:** `docs/MCP.md` (tool definitions), `docs/API.md` (endpoint mapping)

**Dependencies:** `@modelcontextprotocol/sdk`

### Tasks

1. Install `@modelcontextprotocol/sdk`
2. Create `src/mcp/server.ts` — MCP server that registers all 7 tools:
   - `hearsay_browse` → `GET /api/browse`
   - `hearsay_read_post` → `GET /api/posts/:id`
   - `hearsay_search` → `GET /api/search`
   - `hearsay_create_post` → `POST /api/posts`
   - `hearsay_comment` → `POST /api/posts/:id/comments`
   - `hearsay_update_post_status` → `PATCH /api/posts/:id`
   - `hearsay_delete_post` → `DELETE /api/posts/:id`
3. Each tool handler: validate params, call the internal HTTP API (or call the route handlers directly), return JSON result
4. Expose MCP endpoint at `/mcp` on the Hono server (HTTP transport) — or use stdio transport for local plugin use
5. Update `src/server.ts` to mount the MCP endpoint
6. Write tests for MCP tool registration and basic tool calls
7. Verify: `claude mcp add --transport http hearsay http://localhost:7432/mcp` works

### Design Decision

The MCP server can either:
- **(A)** Make HTTP requests to its own API endpoints (true thin adapter, but adds network overhead)
- **(B)** Call the route handler functions directly (faster, but tighter coupling)

Recommend **(B)** for local mode — extract the business logic into a service layer that both routes and MCP handlers call. This avoids the MCP server making HTTP calls to itself.

---

## Phase 4: CLI

**Goal:** Thin HTTP client with bash idioms.

**Spec:** `docs/CLI.md`

### Tasks

1. Create `src/cli/index.ts` — CLI entry point using a command parser (e.g. `commander` or manual arg parsing)
2. Implement commands mapping to API calls:
   - `hearsay ls [topic]` → `GET /api/browse`
   - `hearsay cat <post_id>` → `GET /api/posts/:id`
   - `hearsay grep <query> [topic]` → `GET /api/search`
   - `hearsay post <topic>` → `POST /api/posts`
   - `hearsay comment <post_id>` → `POST /api/posts/:id/comments`
   - `hearsay status <post_id> <status>` → `PATCH /api/posts/:id`
   - `hearsay archive/obsolete/restore <post_id>` — shortcuts for status
   - `hearsay rm <post_id>` → `DELETE /api/posts/:id`
3. Output formatting: markdown for TTY, plain IDs for piped, JSON for `--json`
4. Config resolution: `--server` flag > `HEARSAY_URL` env > `~/.hearsay/config.json`
5. Add `"bin"` field to `package.json`
6. Test: run CLI commands against a running server

---

## Phase 5: Web UI

**Goal:** React SPA for humans to browse, search, create posts.

**Spec:** `docs/WEB_UI.md`

### Tasks

1. Set up Vite + React in `web/` directory
2. Build the sidebar topic tree component
3. Build the topic browser view (subtopic cards + post cards)
4. Build the post detail view (post + comments + comment form)
5. Build the search view
6. Build the create post form
7. Serve static build from Hono (`/` serves the SPA, `/api` serves the API)
8. URL routing: `/` root, `/:topic/` browsing, `/post/:id` detail, `/search`, `/new`

---

## Phase 6: Claude Code Plugin

**Goal:** Plugin that bundles MCP connection, hooks, and slash commands.

**Spec:** `docs/PLUGIN.md`

### Tasks

1. Create plugin directory structure with `plugin.json` manifest
2. Implement `hooks.json` with SessionStart, PreToolUse, and Stop hooks
3. Create `scripts/session-start.sh` — gather git context, surface recent posts
4. Create `scripts/inject-context.sh` — inject author and commit_sha into write calls
5. Create slash command markdown files for `/hearsay` and `/hearsay-post`
6. Implement first-run setup flow (ask for server URL or start local)
7. Test: install plugin locally, verify hooks fire and MCP tools are available

---

## Key Files Reference

```
src/
  server.ts              — entry point
  db/
    index.ts             — SQLite connection + initDatabase()
    schema.ts            — Drizzle schema (posts, comments)
  routes/
    api.ts               — Hono router composition
    posts.ts             — CRUD endpoints
    browse.ts            — topic browsing
    search.ts            — FTS5 search
  lib/
    uuid.ts              — UUID v7 generator
    files.ts             — file path extractor
    format.ts            — post formatting helper
test/
  api.test.ts            — 30 integration tests
docs/
  API.md                 — HTTP API spec (source of truth)
  MCP.md                 — MCP tool spec
  CLI.md                 — CLI commands
  DATA_MODEL.md          — SQLite schema
  WEB_UI.md              — UI spec
  PLUGIN.md              — Plugin spec
  AUTH.md                — Auth (parked)
```
