# CLI Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the existing CLI and backend to match the polished CLI spec (docs/CLI.md) — rename cat→read, add find/edit commands, strip interactivity, TSV output with --quiet, auto-detect author from git.

**Architecture:** The CLI already exists (src/cli/). This is a refactor, not a greenfield build. One new backend endpoint (`GET /api/find`) for metadata-only queries. Two new CLI commands (`find`, `edit`). Existing commands updated for new output conventions and stripped interactivity.

**Tech Stack:** TypeScript, Bun, Hono, Commander.js, SQLite (via drizzle-orm + raw queries)

---

## File Structure

**Create:**
- `src/routes/find.ts` — new metadata-query endpoint
- `test/find.test.ts` — API tests for find endpoint

**Modify:**
- `src/routes/api.ts` — mount findRouter
- `src/routes/search.ts` — add `updated_at` to search results (needed for TSV output)
- `src/cli/index.ts` — rename cat→read, add find/edit commands, strip interactivity, add --quiet, slim grep, git author
- `src/cli/client.ts` — add find(), updatePost(), updateComment() methods
- `src/cli/format.ts` — rewrite formatters for TSV output with --quiet support
- `src/cli/config.ts` — add author resolution from git
- `test/cli.test.ts` — update all tests
- `docs/API.md` — document find endpoint

---

## Chunk 1: Backend — Find Endpoint

### Task 1: Add `GET /api/find` endpoint

**Files:**
- Create: `src/routes/find.ts`
- Modify: `src/routes/api.ts:1-10`
- Test: `test/find.test.ts`

- [ ] **Step 1: Write failing tests for find endpoint**

Create `test/find.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/find.test.ts`
Expected: Failures — no find router exists, import errors.

- [ ] **Step 3: Implement the find route**

Create `src/routes/find.ts`:

```typescript
import { Hono } from "hono";
import { sqlite } from "../db";

export const findRouter = new Hono();

findRouter.get("/", (c) => {
  const author = c.req.query("author");
  const tags = c.req.queries("tag") || [];
  const since = c.req.query("since");
  const before = c.req.query("before");
  const file = c.req.query("file");
  const commit = c.req.query("commit");
  const status = c.req.query("status") || "active";
  const topic = c.req.query("topic");
  const orderBy = c.req.query("order_by") || "updated_at";
  const order = c.req.query("order") || "desc";
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "20"), 1), 100);
  const cursor = c.req.query("cursor");

  // Require at least one filter (topic counts as a filter)
  const hasFilter = author || tags.length > 0 || since || before || file || commit || topic;
  if (!hasFilter) {
    return c.json(
      { error: "At least one filter is required. Use kilroy ls for unfiltered listing.", code: "INVALID_INPUT" },
      400
    );
  }

  // Build SQL query
  const conditions: string[] = [];
  const params: any[] = [];

  if (author) {
    conditions.push("author = ?");
    params.push(author);
  }

  if (commit) {
    conditions.push("commit_sha = ?");
    params.push(commit);
  }

  if (since) {
    conditions.push("updated_at >= ?");
    params.push(since);
  }

  if (before) {
    conditions.push("updated_at <= ?");
    params.push(before);
  }

  if (status !== "all") {
    conditions.push("status = ?");
    params.push(status);
  }

  if (topic) {
    conditions.push("(topic = ? OR topic LIKE ?)");
    params.push(topic, `${topic}/%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Sort
  const sortCol = orderBy === "created_at" ? "created_at" : orderBy === "title" ? "title" : "updated_at";
  const sortDir = order === "asc" ? "ASC" : "DESC";

  const query = `SELECT * FROM posts ${where} ORDER BY ${sortCol} ${sortDir}, id ${sortDir}`;
  let rows = sqlite.prepare(query).all(...params) as any[];

  // Post-query filters (tags, file) — these require JSON parsing
  if (tags.length > 0) {
    rows = rows.filter((p: any) => {
      const postTags: string[] = p.tags ? JSON.parse(p.tags) : [];
      return tags.every((t) => postTags.includes(t));
    });
  }

  if (file) {
    rows = rows.filter((p: any) => {
      const postFiles: string[] = p.files ? JSON.parse(p.files) : [];
      return postFiles.includes(file);
    });
  }

  // Cursor-based pagination (offset style for simplicity)
  let startIdx = 0;
  if (cursor) {
    startIdx = parseInt(cursor) || 0;
  }

  const paged = rows.slice(startIdx, startIdx + limit);
  const hasMore = startIdx + limit < rows.length;

  const results = paged.map((row: any) => ({
    id: row.id,
    title: row.title,
    topic: row.topic,
    status: row.status,
    tags: row.tags ? JSON.parse(row.tags) : [],
    author: row.author,
    files: row.files ? JSON.parse(row.files) : [],
    commit_sha: row.commit_sha,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const response: any = { results };
  if (hasMore) {
    response.next_cursor = String(startIdx + limit);
    response.has_more = true;
  }

  return c.json(response);
});
```

- [ ] **Step 4: Mount the find router**

In `src/routes/api.ts`, add the import and mount. The existing export is `api` (not `apiRouter`):

```typescript
import { Hono } from "hono";
import { postsRouter } from "./posts";
import { browseRouter } from "./browse";
import { searchRouter } from "./search";
import { findRouter } from "./find";

export const api = new Hono();

api.route("/posts", postsRouter);
api.route("/browse", browseRouter);
api.route("/search", searchRouter);
api.route("/find", findRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test test/find.test.ts`
Expected: All tests pass.

- [ ] **Step 6: Run full test suite to verify no regressions**

Run: `bun test`
Expected: All existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/routes/find.ts src/routes/api.ts test/find.test.ts
git commit -m "api: add GET /api/find endpoint for metadata-only queries"
```

---

## Chunk 2: CLI Refactor — Strip Interactivity, Rename, Git Author

### Task 2: Strip interactivity and rename cat to read

**Files:**
- Modify: `src/cli/index.ts:1-262`

- [ ] **Step 1: Remove openEditor, readLine, and all TTY checks**

In `src/cli/index.ts`:

Delete the `openEditor()` function (lines 240-260).
Delete the `readLine()` function (lines 229-237).

In the `post` command action (lines 107-132): remove the `$EDITOR` block (lines 116-118). Keep only the stdin read and error message. Update error message to: `"Error: No body provided. Use --body or pipe stdin."`.

In the `comment` command action (lines 142-163): same — remove $EDITOR block (lines 149-151). Update error message.

In the `rm` command (lines 195-212): remove the confirmation prompt block (lines 201-208) and the `--force` option (line 198). The action just calls deletePost directly.

- [ ] **Step 2: Rename `cat` to `read`**

In `src/cli/index.ts`, change the command definition from:
```typescript
.command("cat <post_id>")
.description("Read a post and its comments")
```
to:
```typescript
.command("read <post_id>")
.description("Read a post and its comments")
```

Update the section comment from `// ─── cat` to `// ─── read`.

- [ ] **Step 3: Run existing tests to see expected failures**

Run: `bun test test/cli.test.ts`
Expected: `kilroy cat` tests fail (command renamed). `kilroy rm --force` tests fail (flag removed).

- [ ] **Step 4: Commit**

```bash
git add src/cli/index.ts
git commit -m "cli: strip interactivity, rename cat to read"
```

### Task 3: Auto-detect author from git config

**Files:**
- Modify: `src/cli/config.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Add author resolution to config**

In `src/cli/config.ts`, add author to the config interface and resolution:

```typescript
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { spawnSync } from "child_process";

export interface CliConfig {
  serverUrl: string;
  author: string | null;
}

const DEFAULT_URL = "http://localhost:7432";

function gitUserName(): string | null {
  try {
    const result = spawnSync("git", ["config", "user.name"], { encoding: "utf-8" });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {}
  return null;
}

export function resolveConfig(opts: { server?: string; author?: string }): CliConfig {
  // Server URL
  let serverUrl = DEFAULT_URL;
  if (opts.server) {
    serverUrl = opts.server.replace(/\/$/, "");
  } else if (process.env.KILROY_URL) {
    serverUrl = process.env.KILROY_URL.replace(/\/$/, "");
  } else {
    try {
      const configPath = join(homedir(), ".kilroy", "config.json");
      const raw = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.server_url) {
        serverUrl = parsed.server_url.replace(/\/$/, "");
      }
    } catch {}
  }

  // Author: --author flag > git config user.name
  const author = opts.author || gitUserName();

  return { serverUrl, author };
}
```

- [ ] **Step 2: Thread author through CLI commands**

In `src/cli/index.ts`, update the `client()` helper to also resolve config with author, and use it in write commands. Change the top-level setup:

```typescript
function getConfig(): CliConfig {
  const opts = program.opts();
  return resolveConfig({ server: opts.server });
}

function client(): KilroyClient {
  return new KilroyClient(getConfig().serverUrl);
}
```

In the `post` action, inject author from config if not provided by --author flag:
```typescript
// After building payload
if (!payload.author) {
  const config = getConfig();
  if (config.author) payload.author = config.author;
}
```

Same pattern for `comment` and `edit` (when added).

- [ ] **Step 3: Commit**

```bash
git add src/cli/config.ts src/cli/index.ts
git commit -m "cli: auto-detect author from git config user.name"
```

---

### Task 2.5: Add `updated_at` to search results

The search API strips `updated_at` from results, but the CLI spec requires a date column in grep output. Both `ftsSearch` and `regexSearch` in `src/routes/search.ts` already have access to `_updated_at` internally but strip it in the clean-up step.

**Files:**
- Modify: `src/routes/search.ts:198-208` (ftsSearch cleanResults)
- Modify: `src/routes/search.ts:349-358` (regexSearch cleanResults)

- [ ] **Step 1: Add `updated_at` to ftsSearch clean results**

In `src/routes/search.ts`, in the `ftsSearch` function, update the `cleanResults` mapping (around line 199) to include `updated_at`:

```typescript
  const cleanResults = paged.map((r, i) => ({
    post_id: r.post_id,
    title: r.title,
    topic: r.topic,
    status: r.status,
    tags: r.tags,
    snippet: r.snippet,
    match_location: r.match_location,
    rank: startIdx + i + 1,
    updated_at: r._updated_at,
  }));
```

- [ ] **Step 2: Add `updated_at` to regexSearch clean results**

Same change in `regexSearch` (around line 349):

```typescript
  const cleanResults = paged.map((r: any, i: number) => ({
    post_id: r.post_id,
    title: r.title,
    topic: r.topic,
    status: r.status,
    tags: r.tags,
    snippet: r.snippet,
    match_location: r.match_location,
    rank: startIdx + i + 1,
    updated_at: r._updated_at,
  }));
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/search.ts
git commit -m "api: include updated_at in search results"
```

---

## Chunk 3: CLI Output — TSV Formatters and --quiet

### Task 4: Rewrite formatters for TSV output and --quiet support

**Files:**
- Modify: `src/cli/format.ts`
- Modify: `src/cli/index.ts` (add --quiet flag to ls, grep)

- [ ] **Step 1: Rewrite format.ts**

Replace `src/cli/format.ts` with:

```typescript
export interface OutputOpts {
  json?: boolean;
  quiet?: boolean;
  formatter: (data: any) => { default: string; quiet: string };
}

export function output(data: any, opts: OutputOpts) {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const formatted = opts.formatter(data);
  console.log(opts.quiet ? formatted.quiet : formatted.default);
}

// ─── List formatters (TSV + quiet) ──────────────────────────────

export function formatBrowse(data: any): { default: string; quiet: string } {
  const lines: string[] = [];
  const ids: string[] = [];

  // Subtopics
  if (data.subtopics?.length) {
    for (const st of data.subtopics) {
      const count = st.post_count === 1 ? "1 post" : `${st.post_count} posts`;
      lines.push(`${st.name}/\t${count}`);
    }
    if (data.posts?.length) lines.push("");
  }

  // Posts as TSV: id \t topic \t status \t date \t title
  for (const p of data.posts || []) {
    const date = p.updated_at?.slice(0, 10) || "";
    lines.push(`${p.id}\t${p.topic}\t${p.status}\t${date}\t${p.title}`);
    ids.push(p.id);
  }

  if (!data.subtopics?.length && !data.posts?.length) {
    lines.push("(empty)");
  }

  if (data.has_more) {
    lines.push(`\n--cursor ${data.next_cursor} for more`);
  }

  return { default: lines.join("\n"), quiet: ids.join("\n") };
}

export function formatSearch(data: any): { default: string; quiet: string } {
  const lines: string[] = [];
  const ids: string[] = [];

  for (const r of data.results || []) {
    const date = r.updated_at?.slice(0, 10) || "";
    lines.push(`${r.post_id}\t${r.topic}\t${r.status}\t${date}\t${r.title}`);
    ids.push(r.post_id);
  }

  if (!data.results?.length) {
    lines.push("No results found.");
  }

  if (data.has_more) {
    lines.push(`\n--cursor ${data.next_cursor} for more`);
  }

  return { default: lines.join("\n"), quiet: ids.join("\n") };
}

export function formatFind(data: any): { default: string; quiet: string } {
  const lines: string[] = [];
  const ids: string[] = [];

  for (const r of data.results || []) {
    const date = r.updated_at?.slice(0, 10) || "";
    lines.push(`${r.id}\t${r.topic}\t${r.status}\t${date}\t${r.title}`);
    ids.push(r.id);
  }

  if (!data.results?.length) {
    lines.push("No results found.");
  }

  if (data.has_more) {
    lines.push(`\n--cursor ${data.next_cursor} for more`);
  }

  return { default: lines.join("\n"), quiet: ids.join("\n") };
}

// ─── Info formatter (markdown) ──────────────────────────────────

export function formatPost(data: any): { default: string; quiet: string } {
  const lines: string[] = [];

  lines.push(`# ${data.title}`);

  const meta: string[] = [];
  if (data.topic) meta.push(`topic: ${data.topic}`);
  meta.push(`status: ${data.status}`);
  if (data.author) meta.push(`by: ${data.author}`);
  lines.push(meta.join(" | "));

  if (data.tags?.length) lines.push(`tags: ${data.tags.join(", ")}`);
  if (data.files?.length) lines.push(`files: ${data.files.join(", ")}`);
  if (data.commit_sha) lines.push(`commit_sha: ${data.commit_sha}`);

  const created = data.created_at?.slice(0, 10) || "";
  const updated = data.updated_at?.slice(0, 10) || "";
  lines.push(`created: ${created}  updated: ${updated}`);
  lines.push("");
  lines.push(data.body || "");

  if (data.comments?.length) {
    for (const c of data.comments) {
      lines.push("");
      lines.push("---");
      const cDate = c.created_at?.slice(0, 10) || "";
      lines.push(`**${c.author || "anonymous"}** \u00b7 ${cDate}`);
      lines.push(c.body || "");
    }
  }

  const text = lines.join("\n");
  return { default: text, quiet: text };
}

// ─── Write formatters (ID output) ──────────────────────────────

export function formatCreated(data: any): { default: string; quiet: string } {
  return { default: data.id, quiet: data.id };
}

export function formatStatus(data: any): { default: string; quiet: string } {
  return { default: data.id, quiet: data.id };
}

export function formatDeleted(data: any): { default: string; quiet: string } {
  return { default: data.post_id, quiet: data.post_id };
}
```

- [ ] **Step 2: Update index.ts to use new formatter signatures**

Update all `output()` calls in `src/cli/index.ts` to pass `quiet` option and match new formatter signatures.

For the `ls` command:
- Add `.option("-q, --quiet", "Post IDs only", false)` flag
- Change action: `output(data, { json: opts.json, quiet: opts.quiet, formatter: formatBrowse });`

For the `grep` command:
- Add `.option("-q, --quiet", "Post IDs only", false)` flag
- Change action: `output(data, { json: opts.json, quiet: opts.quiet, formatter: formatSearch });`

For the `read` command:
- Change action: `output(data, { json: opts.json, formatter: formatPost });`

For `post`:
- Change action: `output(data, { json: opts.json, formatter: formatCreated });`

For `comment`:
- Change action: `output(data, { json: opts.json, formatter: formatCreated });`

For `status`/`archive`/`obsolete`/`restore`:
- Change action: `output(data, { json: opts.json, formatter: formatStatus });`

For `rm`:
- Change action: `output(data, { json: opts.json, formatter: formatDeleted });`

Update imports to include `formatFind` and update `formatCreated` call (no longer takes label arg).

- [ ] **Step 3: Commit**

```bash
git add src/cli/format.ts src/cli/index.ts
git commit -m "cli: TSV output for list commands, --quiet flag, simplified write output"
```

---

## Chunk 4: CLI Commands — Slim Grep, Add Find, Add Edit

### Task 5: Slim grep — remove --tag and --status

**Files:**
- Modify: `src/cli/index.ts` (grep command section)

- [ ] **Step 1: Remove --tag and --status from grep**

In the `grep` command definition, remove these two lines:
```typescript
.option("--tag <tag>", "Filter by tag (repeatable)", collect, [])
.option("-s, --status <status>", "Filter: active, archived, obsolete, all", "active")
```

In the action, remove:
```typescript
if (opts.tag.length) params.tags = opts.tag.join(",");
if (opts.status !== "active") params.status = opts.status;
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/index.ts
git commit -m "cli: slim grep to content-only search"
```

### Task 6: Add find command to CLI

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `src/cli/client.ts`

- [ ] **Step 1: Add find() method to client**

In `src/cli/client.ts`, add:

```typescript
async find(params: Record<string, string | string[]>): Promise<any> {
  // Handle array params (tags) by building URL manually
  const url = new URL("/api/find", this.baseUrl);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        url.searchParams.append(k, item);
      }
    } else if (v !== undefined && v !== "") {
      url.searchParams.set(k, v);
    }
  }
  return this.request(url.toString(), { method: "GET" });
}
```

- [ ] **Step 2: Add find command to index.ts**

In `src/cli/index.ts`, after the grep command section, add:

```typescript
// ─── find ───────────────────────────────────────────────────────

program
  .command("find [topic]")
  .description("Search posts by metadata")
  .option("-a, --author <author>", "Filter by author")
  .option("--tag <tag>", "Filter by tag (repeatable)", collect, [])
  .option("--since <date>", "Posts updated after date (ISO 8601)")
  .option("--before <date>", "Posts updated before date")
  .option("-f, --file <path>", "Posts referencing this file")
  .option("--commit <sha>", "Posts from this commit")
  .option("-s, --status <status>", "Filter: active, archived, obsolete, all", "active")
  .option("--sort <field>", "Sort: updated_at, created_at, title", "updated_at")
  .option("--order <dir>", "Sort direction: asc, desc", "desc")
  .option("-n, --limit <n>", "Max results (1-100)", "20")
  .option("--cursor <cursor>", "Pagination cursor")
  .option("-q, --quiet", "Post IDs only", false)
  .option("--json", "Full JSON response", false)
  .action(async (topicArg: string | undefined, opts) => {
    const params: Record<string, string | string[]> = {};
    const topic = topicArg;
    if (topic) params.topic = topic;
    if (opts.author) params.author = opts.author;
    if (opts.tag.length) params.tag = opts.tag;
    if (opts.since) params.since = opts.since;
    if (opts.before) params.before = opts.before;
    if (opts.file) params.file = opts.file;
    if (opts.commit) params.commit = opts.commit;
    if (opts.status !== "active") params.status = opts.status;
    if (opts.sort !== "updated_at") params.order_by = opts.sort;
    if (opts.order !== "desc") params.order = opts.order;
    if (opts.limit !== "20") params.limit = opts.limit;
    if (opts.cursor) params.cursor = opts.cursor;

    const data = await client().find(params);
    output(data, { json: opts.json, quiet: opts.quiet, formatter: formatFind });
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/index.ts src/cli/client.ts
git commit -m "cli: add find command for metadata queries"
```

### Task 7: Add edit command to CLI

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `src/cli/client.ts`

- [ ] **Step 1: Add updatePost() and updateComment() to client**

In `src/cli/client.ts`, add:

```typescript
async updatePost(postId: string, body: Record<string, any>): Promise<any> {
  return this.patch(`/api/posts/${encodeURIComponent(postId)}`, body);
}

async updateComment(postId: string, commentId: string, body: Record<string, any>): Promise<any> {
  return this.patch(
    `/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    body
  );
}
```

- [ ] **Step 2: Add edit command to index.ts**

In `src/cli/index.ts`, after the find command section, add:

```typescript
// ─── edit ───────────────────────────────────────────────────────

program
  .command("edit <post_id> [comment_id]")
  .description("Update a post or comment")
  .option("--title <title>", "New title (posts only)")
  .option("-b, --body <body>", "New body")
  .option("--tag <tag>", "Replace tags (repeatable, posts only)", collect, [])
  .option("--topic <topic>", "Move to new topic (posts only)")
  .option("--author <author>", "Override author (must match original)")
  .option("--json", "Full JSON response", false)
  .action(async (postId: string, commentId: string | undefined, opts) => {
    let body = opts.body;

    // Read from stdin if no --body
    if (!body && !process.stdin.isTTY) {
      body = await readStdin();
    }

    const config = getConfig();
    const author = opts.author || config.author;

    if (commentId) {
      // Edit comment
      const payload: Record<string, any> = {};
      if (body) payload.body = body;
      if (author) payload.author = author;

      if (!payload.body) {
        console.error("Error: --body or stdin required when editing a comment.");
        process.exit(1);
      }

      const data = await client().updateComment(postId, commentId, payload);
      output(data, { json: opts.json, formatter: formatCreated });
    } else {
      // Edit post
      const payload: Record<string, any> = {};
      if (opts.title) payload.title = opts.title;
      if (body) payload.body = body;
      if (opts.tag.length) payload.tags = opts.tag;
      if (opts.topic) payload.topic = opts.topic;
      if (author) payload.author = author;

      if (Object.keys(payload).length === 0 || (Object.keys(payload).length === 1 && payload.author)) {
        console.error("Error: At least one field required: --title, --body, --tag, --topic.");
        process.exit(1);
      }

      const data = await client().updatePost(postId, payload);
      output(data, { json: opts.json, formatter: formatCreated });
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/index.ts src/cli/client.ts
git commit -m "cli: add edit command for updating posts and comments"
```

---

## Chunk 5: Tests and Docs

### Task 8: Update CLI tests

**Files:**
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Update existing tests for renamed/removed features**

In `test/cli.test.ts`:

Rename the `kilroy cat` describe block to `kilroy read`. Change **all** `cli("cat", ...)` calls to `cli("read", ...)` across the entire file — including the one in the `kilroy rm` test block (line 313: `cli("cat", post.id)` → `cli("read", post.id)`).

In `kilroy rm` tests, remove `"--force"` argument (no longer needed).

- [ ] **Step 2: Add find command tests**

Add to `test/cli.test.ts`:

```typescript
// ─── find ───────────────────────────────────────────────────────

describe("kilroy find", () => {
  it("finds posts by author", async () => {
    const post = await apiPost("/api/posts", {
      title: "Find by author",
      topic: "cli-test",
      body: "findable",
      author: "test-finder",
    });

    const { stdout, code } = await cli("find", "--author", "test-finder", "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.results.some((r: any) => r.id === post.id)).toBe(true);

    await apiDelete(`/api/posts/${post.id}`);
  });

  it("finds posts by tag", async () => {
    const post = await apiPost("/api/posts", {
      title: "Find by tag",
      topic: "cli-test",
      body: "tagged",
      tags: ["findme"],
    });

    const { stdout, code } = await cli("find", "--tag", "findme", "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.results.some((r: any) => r.id === post.id)).toBe(true);

    await apiDelete(`/api/posts/${post.id}`);
  });

  it("requires at least one filter", async () => {
    const { code, stderr } = await cli("find");
    expect(code).toBe(1);
  });
});
```

- [ ] **Step 3: Add edit command tests**

Add to `test/cli.test.ts`:

```typescript
// ─── edit ───────────────────────────────────────────────────────

describe("kilroy edit", () => {
  it("edits a post title", async () => {
    const post = await apiPost("/api/posts", {
      title: "Original title",
      topic: "cli-test",
      body: "body",
      author: "editor",
    });

    const { stdout, code } = await cli(
      "edit", post.id,
      "--title", "Updated title",
      "--author", "editor",
      "--json"
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.title).toBe("Updated title");

    await apiDelete(`/api/posts/${post.id}`);
  });

  it("edits a comment", async () => {
    const post = await apiPost("/api/posts", {
      title: "Comment edit target",
      topic: "cli-test",
      body: "body",
    });

    const comment = await (await fetch(`${SERVER_URL}/api/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "original comment", author: "commenter" }),
    })).json();

    const { stdout, code } = await cli(
      "edit", post.id, comment.id,
      "--body", "updated comment",
      "--author", "commenter",
      "--json"
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.body).toBe("updated comment");

    await apiDelete(`/api/posts/${post.id}`);
  });
});
```

- [ ] **Step 4: Add --quiet flag tests and edit error case**

```typescript
// ─── --quiet flag ────────────────────────────────────────────────

describe("kilroy ls --quiet", () => {
  it("outputs only post IDs", async () => {
    const post = await apiPost("/api/posts", {
      title: "Quiet test",
      topic: "cli-test",
      body: "body",
    });

    const { stdout, code } = await cli("ls", "-q", "cli-test");
    expect(code).toBe(0);
    expect(stdout).toContain(post.id);
    // Should not contain title or topic
    expect(stdout).not.toContain("Quiet test");

    await apiDelete(`/api/posts/${post.id}`);
  });
});

describe("kilroy grep --quiet", () => {
  it("outputs only post IDs", async () => {
    const post = await apiPost("/api/posts", {
      title: "Grep quiet test",
      topic: "cli-test",
      body: "unique_quiet_grep_term",
    });

    const { stdout, code } = await cli("grep", "-q", "unique_quiet_grep_term");
    expect(code).toBe(0);
    expect(stdout).toContain(post.id);
    expect(stdout).not.toContain("Grep quiet test");

    await apiDelete(`/api/posts/${post.id}`);
  });
});

// ─── edit error cases ───────────────────────────────────────────

describe("kilroy edit (error cases)", () => {
  it("errors when no fields provided", async () => {
    const post = await apiPost("/api/posts", {
      title: "Edit error test",
      topic: "cli-test",
      body: "body",
    });

    const { code, stderr } = await cli("edit", post.id);
    expect(code).toBe(1);

    await apiDelete(`/api/posts/${post.id}`);
  });
});
```

- [ ] **Step 5: Run all tests**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add test/cli.test.ts
git commit -m "test: update CLI tests for read, find, edit, quiet"
```

### Task 9: Update API docs

**Files:**
- Modify: `docs/API.md`

- [ ] **Step 1: Add find endpoint documentation**

After the Search section in `docs/API.md`, add:

```markdown
### Find (Metadata Query)

\`\`\`
GET /api/find
\`\`\`

Search posts by metadata without full-text search. Maps to CLI command `kilroy find`. At least one filter parameter is required.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `author` | string | — | Filter by post author. |
| `tag` | string | — | Filter by tag. Repeatable (AND). |
| `since` | string | — | Posts updated on or after this date (ISO 8601). |
| `before` | string | — | Posts updated on or before this date. |
| `file` | string | — | Posts referencing this file path. |
| `commit` | string | — | Posts from this commit SHA. |
| `status` | string | `"active"` | Filter: `active`, `archived`, `obsolete`, `all`. |
| `topic` | string | — | Restrict to topic prefix. |
| `order_by` | string | `"updated_at"` | Sort: `updated_at`, `created_at`, `title`. |
| `order` | string | `"desc"` | Sort direction: `asc`, `desc`. |
| `limit` | number | `20` | Max results (1-100). |
| `cursor` | string | — | Pagination cursor. |

**Response: `200 OK`**

\`\`\`json
{
  "results": [
    {
      "id": "019532a1-...",
      "title": "OAuth setup gotchas",
      "topic": "auth/google",
      "status": "active",
      "tags": ["oauth", "gotcha"],
      "author": "claude-session-abc",
      "files": ["src/auth/oauth.ts"],
      "commit_sha": "a1b2c3d",
      "created_at": "2026-03-01T10:00:00Z",
      "updated_at": "2026-03-03T14:22:00Z"
    }
  ],
  "next_cursor": "2",
  "has_more": true
}
\`\`\`

**Error: `400 INVALID_INPUT`** if no filter parameters are provided.
```

- [ ] **Step 2: Add find to MCP tool mapping table**

In the mapping table at the bottom of API.md, add a row noting that find is CLI-only (no MCP tool):

```markdown
| *(CLI only)* | GET | `/api/find` |
```

- [ ] **Step 3: Commit**

```bash
git add docs/API.md
git commit -m "docs: add GET /api/find endpoint to API docs"
```
