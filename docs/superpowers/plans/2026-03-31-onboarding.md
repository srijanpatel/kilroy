# Onboarding & Landing Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a landing page with workspace creation, restructure the SPA for workspace-scoped routing with context, update the join page and empty state to show `/kilroy setup` commands, and add the `/kilroy setup` plugin command.

**Architecture:** The React SPA gains a root route (`/`) for the landing page. All workspace routes move under `/:workspace/*` via a `WorkspaceShell` layout that provides workspace context. The server serves the SPA at both `/` and `/:workspace/*`, with static assets at both levels. DB switches from hashed to raw project keys.

**Tech Stack:** React + React Router (SPA), Hono (server), Drizzle + PostgreSQL (DB), Bun (runtime/test)

**Spec:** `docs/superpowers/specs/2026-03-31-onboarding-design.md`

---

## File Map

**Create:**
- `web/src/views/LandingView.tsx` — Landing page with workspace creation form
- `web/src/context/WorkspaceContext.tsx` — WorkspaceContext provider + `useWorkspace()` hook + `useWorkspacePath()` navigation helper
- `web/src/views/WorkspaceShell.tsx` — Layout wrapping all workspace routes (Omnibar, AuthorPrompt, child routes)
- `src/routes/info.ts` — `GET /api/info` endpoint returning workspace setup command + join link
- `plugin/commands/setup.md` — `/kilroy setup` command

**Modify:**
- `src/db/schema.ts` — `projectKeyHash` → `projectKey`
- `src/workspaces/registry.ts` — Remove hashing, store/compare raw key
- `src/middleware/workspace.ts` — Direct key comparison
- `src/routes/workspaces.ts` — Move join handler to API route (`GET /api/join`), remove old join handler
- `src/server.ts` — Serve SPA at `/`, mount assets at root level, remove old join route
- `web/src/App.tsx` — New route structure: `/` → LandingView, `/:workspace/*` → WorkspaceShell
- `web/src/lib/api.ts` — Replace `window.location.pathname` with context-based workspace slug
- `web/src/views/BrowseView.tsx` — Enhanced empty state with setup command
- `web/src/views/JoinView.tsx` — Call API join endpoint, show setup command
- `web/src/components/Omnibar.tsx` — Workspace-prefixed navigation
- `web/src/views/PostView.tsx` — Workspace-prefixed navigation
- `web/src/views/SearchView.tsx` — Workspace-prefixed navigation
- `web/src/views/NewPostView.tsx` — Workspace-prefixed navigation
- `test/helpers.ts` — Update for raw key schema change

**Delete:**
- `src/landing.ts` — Replaced by React LandingView

---

## Chunk 1: Database & Auth — Raw Project Keys

### Task 1: Update schema and registry to use raw keys

**Files:**
- Modify: `src/db/schema.ts:3` (workspaces table)
- Modify: `src/workspaces/registry.ts` (full file)
- Modify: `src/middleware/workspace.ts` (full file)
- Modify: `test/helpers.ts`

- [ ] **Step 1: Update schema — rename column**

In `src/db/schema.ts`, change:
```ts
projectKeyHash: text("project_key_hash").notNull(),
```
to:
```ts
projectKey: text("project_key").notNull(),
```

- [ ] **Step 2: Update registry — remove hashing**

In `src/workspaces/registry.ts`:

Remove the `hashKey` function entirely (lines 25-29).

In `createWorkspace`, change:
```ts
projectKeyHash: hashKey(projectKey),
```
to:
```ts
projectKey,
```

In `validateKey`, change:
```ts
const keyHash = hashKey(key);
if (keyHash !== workspace.projectKeyHash) {
```
to:
```ts
if (key !== workspace.projectKey) {
```

Also remove the `Bun.CryptoHasher` import (it's used only by hashKey).

- [ ] **Step 3: Update auth middleware**

No code changes needed — `workspace.ts` calls `validateKey()` which we already updated. Verify by reading the file.

- [ ] **Step 4: Update test helpers**

In `test/helpers.ts`, the `resetDb` function calls `createWorkspace` which returns `projectKey` — this still works. But the TRUNCATE and schema init need the new column name. Read the file and verify no references to `projectKeyHash`.

- [ ] **Step 5: Reset the database**

The column rename means existing data is incompatible. Since we're pre-launch:

```bash
cd /home/ubuntu/kilroy && bun run src/db/index.ts
```

Or if the DB push is handled differently, check `package.json` for a db:push or migrate script. The Drizzle `push` command will handle the column rename.

```bash
bunx drizzle-kit push
```

- [ ] **Step 6: Run tests**

```bash
cd /home/ubuntu/kilroy && bun test test/api.test.ts
```

Expected: All pass. The tests use `createWorkspace` from helpers which returns `projectKey` — unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/workspaces/registry.ts test/helpers.ts
git commit -m "refactor: store raw project key instead of hash"
```

---

### Task 2: Add `GET /api/info` endpoint

**Files:**
- Create: `src/routes/info.ts`
- Modify: `src/routes/api.ts`

- [ ] **Step 1: Write test for the info endpoint**

Add to `test/api.test.ts`:

```ts
describe("GET /api/info", () => {
  beforeEach(setup);

  it("returns workspace info with setup command and join link", async () => {
    const res = await app.request("/api/info");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.slug).toBe("test-workspace");
    expect(data.setup_command).toContain("/kilroy setup");
    expect(data.setup_command).toContain(testToken);
    expect(data.join_link).toContain("/test-workspace/join?token=");
    expect(data.join_link).toContain(testToken);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ubuntu/kilroy && bun test test/api.test.ts --filter "GET /api/info"
```

Expected: FAIL — no `/api/info` route.

- [ ] **Step 3: Create info route**

Create `src/routes/info.ts`:

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { workspaces } from "../db/schema";
import type { Env } from "../types";

export const infoRouter = new Hono<Env>();

infoRouter.get("/", async (c) => {
  const workspaceId = c.get("workspaceId");
  const workspaceSlug = c.get("workspaceSlug");

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!workspace) {
    return c.json({ error: "Workspace not found", code: "NOT_FOUND" }, 404);
  }

  const baseUrl = new URL(c.req.url).origin;
  const workspaceUrl = `${baseUrl}/${workspaceSlug}`;

  return c.json({
    slug: workspaceSlug,
    setup_command: `/kilroy setup ${workspaceUrl} ${workspace.projectKey}`,
    join_link: `${workspaceUrl}/join?token=${workspace.projectKey}`,
  });
});
```

- [ ] **Step 4: Register in api.ts**

Read `src/routes/api.ts` first, then add:

```ts
import { infoRouter } from "./info";
```

And mount it:

```ts
api.route("/info", infoRouter);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /home/ubuntu/kilroy && bun test test/api.test.ts --filter "GET /api/info"
```

Expected: PASS.

Note: The test uses `createTestApp()` which doesn't set `c.req.url` with a real origin. The `new URL(c.req.url).origin` may return something like `http://localhost`. That's fine for testing — the shape of the response is what matters.

- [ ] **Step 6: Commit**

```bash
git add src/routes/info.ts src/routes/api.ts test/api.test.ts
git commit -m "feat: add GET /api/info endpoint for workspace setup details"
```

---

### Task 3: Restructure join endpoint

The current `GET /:workspace/join` returns JSON directly, which prevents the SPA from rendering. Move validation to an API endpoint; let the SPA fallback serve the join page.

**Files:**
- Modify: `src/routes/workspaces.ts`
- Modify: `src/routes/api.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Write test for the new join API endpoint**

Add to `test/api.test.ts`. The test app in helpers bypasses auth, so we need a slightly different approach — test the join logic directly:

```ts
describe("GET /api/join", () => {
  beforeEach(setup);

  it("validates token and returns setup info", async () => {
    // Need to test against full app with real auth for join
    // For now, test that the endpoint exists and rejects missing token
    const res = await app.request("/api/join");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("token");
  });

  it("rejects invalid token", async () => {
    const res = await app.request("/api/join?token=invalid");
    // The test app injects workspaceId/workspaceSlug, but validateKey checks DB
    // With test helpers, slug is "test-workspace" and token must match
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Move join handler to API route**

In `src/routes/workspaces.ts`, extract the join logic into a new handler that can be mounted under `/api/join`. The key difference: this is mounted inside the workspace API routes but does NOT require auth middleware (the token IS the auth).

Create a new handler in `src/routes/workspaces.ts` (or a new file `src/routes/join.ts`):

```ts
export const joinApiHandler = new Hono<Env>();

joinApiHandler.get("/", async (c) => {
  const slug = c.req.param("workspace") || c.get("workspaceSlug");
  const token = c.req.query("token");

  if (!token) {
    return c.json(
      { error: "Missing required parameter: token", code: "INVALID_INPUT" },
      400
    );
  }

  const result = await validateKey(slug, token);
  if (!result.valid) {
    return c.json(
      { error: "Invalid project key", code: "UNAUTHORIZED" },
      401
    );
  }

  const isSecure = c.req.url.startsWith("https");
  const maxAge = 90 * 24 * 60 * 60;

  const cookieValue = encodeURIComponent(token);
  let cookie = `klry_session=${cookieValue}; Path=/${slug}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
  if (isSecure) {
    cookie += "; Secure";
  }

  c.header("Set-Cookie", cookie);

  const baseUrl = new URL(c.req.url).origin;
  const workspaceUrl = `${baseUrl}/${slug}`;
  return c.json({
    workspace: slug,
    workspace_url: workspaceUrl,
    setup_command: `/kilroy setup ${workspaceUrl} ${token}`,
  });
});
```

- [ ] **Step 3: Mount join API and remove old join handler**

In `src/server.ts`:
- Remove `joinHandler` import and `workspaceApp.route("/join", joinHandler)`
- Mount the new join API endpoint **before** the auth middleware so it doesn't require auth:

```ts
workspaceApp.route("/api/join", joinApiHandler);
// Then auth middleware
workspaceApp.use("/api/*", workspaceAuth);
```

Wait — the ordering matters. `/api/join` must be mounted BEFORE the `/api/*` auth middleware. Check that Hono respects route-specific handlers over wildcard middleware. If not, mount it outside the auth middleware scope.

- [ ] **Step 4: Run tests**

```bash
cd /home/ubuntu/kilroy && bun test
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/workspaces.ts src/server.ts src/routes/api.ts test/api.test.ts
git commit -m "refactor: move join handler to /api/join, remove direct JSON response"
```

---

## Chunk 2: Server — SPA at Root + Static Assets

### Task 4: Serve SPA and static assets at root level

**Files:**
- Modify: `src/server.ts`
- Delete: `src/landing.ts`

- [ ] **Step 1: Delete landing.ts**

```bash
rm /home/ubuntu/kilroy/src/landing.ts
```

- [ ] **Step 2: Update server.ts — add root-level SPA serving**

In `src/server.ts`, add root-level static asset serving and SPA fallback. The key changes:

```ts
// Serve web UI static assets at root level AND workspace level
const webDistPath = resolve(import.meta.dir, "../web/dist");
if (existsSync(webDistPath)) {
  const indexHtml = readFileSync(resolve(webDistPath, "index.html"), "utf-8");

  // Root-level assets (for LandingView)
  app.use("/assets/*", serveStatic({ root: webDistPath }));

  // Workspace-level assets (existing)
  workspaceApp.use("/assets/*", serveStatic({ root: webDistPath, rewriteRequestPath: (p) => p.replace(/^\/[^/]+/, "") }));

  // SPA fallback for root
  app.get("/", (c) => c.html(indexHtml));

  // SPA fallback for workspace routes
  workspaceApp.get("*", (c) => c.html(indexHtml));
}

// Mount workspace routes AFTER root-level routes
app.route("/workspaces", workspacesRouter);
app.route("/:workspace", workspaceApp);
```

Be careful with ordering: `/assets/*` and `GET /` must be registered before `/:workspace` to avoid the wildcard workspace param catching them. Also, `POST /workspaces` must not be caught by the SPA fallback.

- [ ] **Step 3: Verify server starts**

```bash
cd /home/ubuntu/kilroy && bun run src/server.ts &
curl -s http://localhost:7432/ | head -3
curl -s http://localhost:7432/assets/ -o /dev/null -w "%{http_code}"
kill %1
```

Expected: HTML from index.html at `/`, assets served.

- [ ] **Step 4: Run all tests**

```bash
cd /home/ubuntu/kilroy && bun test
```

- [ ] **Step 5: Commit**

```bash
git add src/server.ts && git rm src/landing.ts
git commit -m "feat: serve SPA at root, mount assets at both levels"
```

---

## Chunk 3: React SPA — Routing Restructure

### Task 5: Create WorkspaceContext and useWorkspace hook

**Files:**
- Create: `web/src/context/WorkspaceContext.tsx`

- [ ] **Step 1: Create the context file**

```tsx
import { createContext, useContext } from 'react';

const WorkspaceContext = createContext<string | null>(null);

export function WorkspaceProvider({ workspace, children }: { workspace: string; children: React.ReactNode }) {
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): string {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('useWorkspace() must be used within a WorkspaceProvider');
  return workspace;
}

/**
 * Returns a function that prefixes paths with the workspace slug.
 * Usage: const wp = useWorkspacePath(); navigate(wp('/post/123'));
 */
export function useWorkspacePath(): (path: string) => string {
  const workspace = useWorkspace();
  return (path: string) => `/${workspace}${path.startsWith('/') ? path : '/' + path}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/context/WorkspaceContext.tsx
git commit -m "feat: add WorkspaceContext with useWorkspace and useWorkspacePath hooks"
```

### Task 6: Create WorkspaceShell layout component

**Files:**
- Create: `web/src/views/WorkspaceShell.tsx`

- [ ] **Step 1: Create WorkspaceShell**

```tsx
import { useState } from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
import { WorkspaceProvider } from '../context/WorkspaceContext';
import { Omnibar } from '../components/Omnibar';
import { AuthorPrompt } from '../components/AuthorPrompt';
import { BrowseView } from './BrowseView';
import { PostView } from './PostView';
import { SearchView } from './SearchView';
import { NewPostView } from './NewPostView';
import { JoinView } from './JoinView';

export function WorkspaceShell() {
  const { workspace } = useParams();
  const [currentTopic, setCurrentTopic] = useState('');

  if (!workspace) return null;

  return (
    <WorkspaceProvider workspace={workspace}>
      <div className="app">
        <AuthorPrompt />
        <Omnibar currentTopic={currentTopic} />
        <Routes>
          <Route path="join" element={<JoinView />} />
          <Route path="post/:id" element={<PostView onTopicChange={setCurrentTopic} />} />
          <Route path="search" element={<SearchView />} />
          <Route path="new" element={<NewPostView />} />
          <Route path="*" element={<BrowseView onTopicChange={setCurrentTopic} />} />
        </Routes>
      </div>
    </WorkspaceProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/views/WorkspaceShell.tsx
git commit -m "feat: add WorkspaceShell layout component"
```

### Task 7: Restructure App.tsx routing

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Rewrite App.tsx**

```tsx
import { Routes, Route } from 'react-router-dom';
import { LandingView } from './views/LandingView';
import { WorkspaceShell } from './views/WorkspaceShell';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingView />} />
      <Route path="/:workspace/*" element={<WorkspaceShell />} />
    </Routes>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/App.tsx
git commit -m "refactor: restructure routing with LandingView at root and WorkspaceShell"
```

### Task 8: Refactor api.ts to accept workspace slug parameter

**Files:**
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: Rewrite api.ts**

Replace the `getBase()` / `BASE` constant pattern with a function that takes the workspace slug:

```ts
function getBase(workspace: string): string {
  return `/${workspace}/api`;
}

async function request(workspace: string, path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${getBase(workspace)}${path}`, {
    credentials: 'include',
    ...init,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export function browse(workspace: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(workspace, `/browse${qs ? `?${qs}` : ''}`);
}

export function readPost(workspace: string, id: string) {
  return request(workspace, `/posts/${encodeURIComponent(id)}`);
}

export function search(workspace: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return request(workspace, `/search?${qs}`);
}

export function createPost(workspace: string, body: Record<string, any>) {
  return request(workspace, '/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function createComment(workspace: string, postId: string, body: Record<string, any>) {
  return request(workspace, `/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateStatus(workspace: string, postId: string, status: string) {
  return request(workspace, `/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function deletePost(workspace: string, postId: string) {
  return request(workspace, `/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
  });
}

export function getWorkspaceInfo(workspace: string) {
  return request(workspace, '/info');
}

export function joinWorkspace(workspace: string, token: string) {
  return request(workspace, `/join?token=${encodeURIComponent(token)}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "refactor: api.ts takes workspace slug param instead of parsing URL"
```

### Task 9: Update all views to use useWorkspace and new api signatures

**Files:**
- Modify: `web/src/views/BrowseView.tsx`
- Modify: `web/src/views/PostView.tsx`
- Modify: `web/src/views/SearchView.tsx`
- Modify: `web/src/views/NewPostView.tsx`
- Modify: `web/src/components/Omnibar.tsx`

- [ ] **Step 1: Update BrowseView**

Add at top:
```tsx
import { useWorkspace, useWorkspacePath } from '../context/WorkspaceContext';
```

Inside the component, add:
```tsx
const workspace = useWorkspace();
const wp = useWorkspacePath();
```

Update all API calls to pass `workspace`:
- `browse(params)` → `browse(workspace, params)`

Update all navigations to use `tp()`:
- `navigate(\`/new...\`)` → `navigate(wp(\`/new...\`))`
- `navigate(\`/${topic}...\`)` → `navigate(wp(\`/${topic}...\`))`
- `navigate(\`/post/${p.id}\`)` → `navigate(wp(\`/post/${p.id}\`))`

- [ ] **Step 2: Update PostView**

Add `useWorkspace` and `useWorkspacePath` imports. Pass `workspace` to all API calls (`readPost`, `createComment`, `updateStatus`, `deletePost`). Use `wp()` for navigation.

- [ ] **Step 3: Update SearchView**

Add `useWorkspace` and `useWorkspacePath` imports. Pass `workspace` to `search()`. Use `wp()` for navigation to posts.

- [ ] **Step 4: Update NewPostView**

Add `useWorkspace` and `useWorkspacePath` imports. Pass `workspace` to `createPost()`. Use `wp()` for navigation after creation.

- [ ] **Step 5: Update Omnibar**

Add `useWorkspace` and `useWorkspacePath` imports. Pass `workspace` to `browse()` and `search()`. Use `wp()` for all navigations. Update the wordmark `<Link to="/">` — this should link to the workspace root (`wp('/')`) not the landing page.

- [ ] **Step 6: Build and verify**

```bash
cd /home/ubuntu/kilroy/web && bun run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/views/ web/src/components/Omnibar.tsx
git commit -m "refactor: all views use useWorkspace context for API calls and navigation"
```

---

## Chunk 4: React Views — Landing, Join, Empty State

### Task 10: Create LandingView

**Files:**
- Create: `web/src/views/LandingView.tsx`

- [ ] **Step 1: Create LandingView component**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KilroyMark } from '../components/KilroyMark';

export function LandingView() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const slugPattern = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleaned = slug.trim().toLowerCase();
    if (!slugPattern.test(cleaned)) {
      setError('3-40 characters, lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: cleaned }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create workspace');
        setCreating(false);
        return;
      }

      // Store the project key in sessionStorage so the empty state can show it
      // before the user has authed (the /api/info endpoint requires auth).
      sessionStorage.setItem('kilroy_new_workspace', JSON.stringify({
        slug: data.slug,
        project_key: data.project_key,
        join_url: data.join_url,
      }));

      navigate(`/${data.slug}/join?token=${data.project_key}`);
    } catch {
      setError('Failed to connect to server');
      setCreating(false);
    }
  };

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">Kilroy</h1>
        </div>

        <p className="landing-tagline">An agent was here.</p>
        <p className="landing-desc">
          Shared memory for AI agents. Kilroy captures tribal knowledge across sessions
          so your workspace's agents never start from zero.
        </p>

        <div className="landing-card">
          <div className="card-label">Create a workspace</div>
          <form onSubmit={handleCreate}>
            <div className="landing-form">
              <input
                className="workspace-input"
                type="text"
                value={slug}
                onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setError(''); }}
                placeholder="my-workspace"
                autoComplete="off"
                spellCheck={false}
                disabled={creating}
              />
              <button type="submit" className="btn btn-primary" disabled={creating || !slug.trim()}>
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
            {error && <p className="landing-error">{error}</p>}
          </form>
        </div>

        <div className="landing-explainer">
          <div className="explainer-item">
            <div className="explainer-icon">MCP</div>
            <div className="explainer-text">Agents talk to Kilroy via MCP tools</div>
          </div>
          <div className="explainer-item">
            <div className="explainer-icon">/kilroy</div>
            <div className="explainer-text">Humans use slash commands or this web UI</div>
          </div>
          <div className="explainer-item">
            <div className="explainer-icon">auto</div>
            <div className="explainer-text">Agents check &amp; post knowledge via hooks</div>
          </div>
        </div>

        <footer className="landing-footer">kilroy — tribal knowledge for AI agents</footer>
      </div>
    </div>
  );
}
```

Note on the post-creation flow: after `POST /workspaces`, we redirect to the join page (`/:workspace/join?token=...`) rather than directly to `/:workspace/`. This way the user's session cookie gets set by the join API call, and they can then access authenticated endpoints like `/api/info`. The join page shows the setup command.

- [ ] **Step 2: Add landing page CSS to index.css**

Append to `web/src/index.css`:

```css
/* Landing page */
.landing {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.landing-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: min(12vh, 100px) 0 0.5rem;
}

.landing-title {
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.landing-tagline {
  font-family: var(--font-serif);
  font-size: 1rem;
  font-weight: 300;
  color: var(--text-muted);
  font-style: italic;
  margin-bottom: 0.6rem;
}

.landing-desc {
  font-size: 0.95rem;
  color: var(--text-muted);
  line-height: 1.6;
  margin-bottom: 2rem;
}

.landing-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 1.25rem;
  margin-bottom: 2rem;
}

.landing-form {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.landing-form .workspace-input {
  flex: 1;
  min-width: 0;
  background: var(--bg-inset);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.landing-form .workspace-input::placeholder { color: var(--text-dim); }
.landing-form .workspace-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.landing-error {
  font-size: 0.82rem;
  color: var(--status-obsolete);
  margin-top: 0.5rem;
}

.landing-explainer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 2rem;
}

@media (max-width: 560px) {
  .landing-explainer { grid-template-columns: 1fr; }
}

.explainer-item {
  text-align: center;
  padding: 0.75rem 0.5rem;
}

.explainer-icon {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--accent);
  margin-bottom: 0.3rem;
}

.explainer-text {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.45;
}

.landing-footer {
  text-align: center;
  padding: 1rem 0 2.5rem;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-dim);
}
```

- [ ] **Step 3: Build and verify**

```bash
cd /home/ubuntu/kilroy/web && bun run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src/views/LandingView.tsx web/src/index.css
git commit -m "feat: add LandingView with workspace creation form"
```

### Task 11: Update JoinView to show setup command

**Files:**
- Modify: `web/src/views/JoinView.tsx`

- [ ] **Step 1: Rewrite JoinView**

The view now calls the new `GET /api/join?token=...` endpoint (which sets the cookie and returns setup info), then displays the `/kilroy setup` command.

```tsx
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useWorkspace, useWorkspacePath } from '../context/WorkspaceContext';
import { joinWorkspace } from '../lib/api';
import { KilroyMark } from '../components/KilroyMark';

export function JoinView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const wp = useWorkspacePath();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No token provided. Ask your workspace admin for the join link.');
      return;
    }

    joinWorkspace(workspace, token)
      .then((d) => {
        setData(d);
        setStatus('success');
      })
      .catch((e) => {
        setStatus('error');
        setError(e.message || 'Invalid token');
      });
  }, [token, workspace]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSaveName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('kilroy_author', trimmed);
    navigate(wp('/'));
  };

  if (status === 'validating') {
    return (
      <div className="content reading" style={{ paddingTop: '4rem' }}>
        <p>Validating your access...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="content reading" style={{ paddingTop: '4rem' }}>
        <h2>Unable to join</h2>
        <p className="error">{error}</p>
      </div>
    );
  }

  return (
    <div className="content reading" style={{ paddingTop: '4rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <KilroyMark size={48} />
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, marginTop: '0.5rem' }}>
          Welcome to {workspace}
        </h2>
      </div>

      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        You now have web UI access. To connect your agent, paste this in Claude Code:
      </p>

      {data?.setup_command && (
        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
          <pre style={{
            background: 'var(--bg-inset)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            overflow: 'auto',
          }}>
            <code>{data.setup_command}</code>
          </pre>
          <button
            className="btn"
            onClick={() => handleCopy(data.setup_command, 'setup')}
            style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
          >
            {copied === 'setup' ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
          What should we call you?
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sarah"
            className="workspace-input"
            style={{ flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
          />
          <button className="btn btn-primary" onClick={handleSaveName}>Continue</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/ubuntu/kilroy/web && bun run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/views/JoinView.tsx
git commit -m "feat: JoinView shows /kilroy setup command instead of JSON config"
```

### Task 12: Enhance BrowseView empty state

**Files:**
- Modify: `web/src/views/BrowseView.tsx`
- Modify: `web/src/components/Skeleton.tsx`

- [ ] **Step 1: Update EmptyState to support setup info**

The root-level empty state (no topic, no posts) should fetch `/api/info` and show the setup command + join link. Modify the empty state section in `BrowseView.tsx`.

Replace the `{!hasContent && (...)}` block at the bottom of BrowseView with:

```tsx
{!hasContent && !topic && <WelcomeEmptyState />}
{!hasContent && topic && (
  <EmptyState
    title="No one's been here yet."
    message="Be the first to leave a note."
    actionLabel="Create the first post"
    onAction={() => navigate(wp(`/new?topic=${encodeURIComponent(topic)}`))}
  />
)}
```

Add a `WelcomeEmptyState` component (can be in the same file or extracted):

```tsx
function WelcomeEmptyState() {
  const workspace = useWorkspace();
  const wp = useWorkspacePath();
  const navigate = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    getWorkspaceInfo(workspace).then(setInfo).catch(() => {});
  }, [workspace]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="empty-state empty-state-hero">
      <div className="empty-state-brand">
        <KilroyMark size={100} className="empty-state-mark" />
        <h2>Welcome to {workspace}</h2>
      </div>
      <p>Your knowledge base is empty. Connect your agent to start capturing tribal knowledge.</p>

      {info?.setup_command && (
        <div className="setup-block">
          <div className="setup-block-label">Paste in Claude Code</div>
          <div className="setup-block-content">
            <code>{info.setup_command}</code>
            <button className="btn" onClick={() => handleCopy(info.setup_command, 'setup')}>
              {copied === 'setup' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {info?.join_link && (
        <div className="setup-block">
          <div className="setup-block-label">Share with others</div>
          <div className="setup-block-content">
            <code>{info.join_link}</code>
            <button className="btn" onClick={() => handleCopy(info.join_link, 'join')}>
              {copied === 'join' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <button
        className="btn btn-primary"
        style={{ marginTop: '1rem' }}
        onClick={() => navigate(wp('/new'))}
      >
        Create the first post
      </button>
    </div>
  );
}
```

Add the required imports at the top of BrowseView.tsx:
```tsx
import { useWorkspace, useWorkspacePath } from '../context/WorkspaceContext';
import { getWorkspaceInfo } from '../lib/api';
import { KilroyMark } from '../components/KilroyMark';
```

- [ ] **Step 2: Add setup-block CSS to index.css**

```css
/* Setup command blocks */
.setup-block {
  margin: 0.75rem auto;
  max-width: 520px;
  text-align: left;
}

.setup-block-label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-dim);
  margin-bottom: 0.3rem;
}

.setup-block-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-inset);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}

.setup-block-content code {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setup-block-content .btn {
  flex-shrink: 0;
  font-size: 0.72rem;
  padding: 0.2rem 0.5rem;
}
```

- [ ] **Step 3: Build and verify**

```bash
cd /home/ubuntu/kilroy/web && bun run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src/views/BrowseView.tsx web/src/index.css
git commit -m "feat: enhanced empty state with setup command and join link"
```

---

## Chunk 5: Plugin Setup Command

### Task 13: Create `/kilroy setup` command

**Files:**
- Create: `plugin/commands/setup.md`

- [ ] **Step 1: Create the command file**

```markdown
---
name: setup
description: Set up Kilroy — create a workspace or configure your agent
argument-hint: [<server-url> <project-key>]
---

Set up Kilroy for this project. There are two modes:

## Mode 1: With arguments (configure existing workspace)

If the user provided arguments like `/kilroy setup <url> <token>`, extract the URL and token from $ARGUMENTS and:

1. Read `.claude/settings.local.json` if it exists (it may have other settings to preserve)
2. Merge the Kilroy env vars into it:
   ```json
   {
     "env": {
       "KILROY_URL": "<the-url>",
       "KILROY_TOKEN": "<the-token>"
     }
   }
   ```
   If the file has existing `env` keys, preserve them — only add/overwrite `KILROY_URL` and `KILROY_TOKEN`.
3. Write the file back
4. Tell the user: "Kilroy is configured. Restart your Claude Code session for the changes to take effect."

## Mode 2: No arguments (create new workspace)

If `/kilroy setup` was called with no arguments:

1. Ask the user for a server URL. Default: `http://localhost:7432`
2. Ask the user for a workspace slug (lowercase, letters/numbers/hyphens, 3-40 chars)
3. Create the workspace by running:
   ```bash
   curl -s -X POST <server-url>/workspaces \
     -H "Content-Type: application/json" \
     -d '{"slug":"<slug>"}'
   ```
4. If the response status is 409, tell the user the slug is taken and ask them to pick another.
5. If the response status is 400, show the error and ask them to fix the slug.
6. On success (201), extract `project_key` and `join_url` from the JSON response.
7. Read `.claude/settings.local.json` if it exists, merge the env vars (same as Mode 1), write it back.
8. Tell the user:
   - "Workspace **<slug>** created!"
   - "Restart your Claude Code session for the changes to take effect."
   - "Share this link with your workspace members: `<join_url>`"

$ARGUMENTS
```

- [ ] **Step 2: Commit**

```bash
git add plugin/commands/setup.md
git commit -m "feat: add /kilroy setup command for agent onboarding"
```

---

## Chunk 6: Integration Test & Cleanup

### Task 14: End-to-end verification

- [ ] **Step 1: Run all backend tests**

```bash
cd /home/ubuntu/kilroy && bun test
```

Expected: All pass.

- [ ] **Step 2: Build frontend**

```bash
cd /home/ubuntu/kilroy/web && bun run build
```

Expected: Clean build, no errors.

- [ ] **Step 3: Start server and verify manually**

```bash
cd /home/ubuntu/kilroy && bun run src/server.ts
```

Check:
- `http://localhost:7432/` → Landing page renders (create workspace form)
- Create a workspace → redirects to `/:workspace/join?token=...` → join page with setup command
- Click Continue → `/:workspace/` → empty state with setup command + join link
- `/:workspace/` routes all work (browse, search, new post)

- [ ] **Step 4: Clean up prototype files**

Verify `src/landing.ts` is deleted. Check for any `.playwright-mcp/` files that shouldn't be committed.

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A && git commit -m "chore: cleanup after onboarding implementation"
```
