# User-Scoped OAuth + Project Param on MCP Tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple auth (user identity) from project routing (which project to write to) so the plugin works user-scoped with a repo-owned project mapping.

**Architecture:** OAuth tokens carry user identity only — no project claims. Every MCP tool takes a `project` param (`account/slug` format). A `resolveProject` helper validates membership per-call. The plugin reads `.kilroy/config.toml` to tell the agent which project to pass. Two new management tools (`kilroy_list_projects`, `kilroy_create_project`) enable setup when the repo is not yet configured.

**Tech Stack:** TypeScript/Bun, Hono, Better Auth OAuth Provider, MCP SDK, React (consent page)

---

### Task 1: Add `resolveProject` helper

**Files:**
- Create: `src/mcp/resolve-project.ts`

- [ ] **Step 1: Create the resolveProject function**

This function parses an `account/slug` string, looks up the project, and validates membership.

```ts
// src/mcp/resolve-project.ts
import { getProjectBySlugs } from "../members/registry";
import { getProjectByAuthUserId } from "../members/registry";

interface ResolvedProject {
  projectId: string;
  memberAccountId: string;
  accountSlug: string;
  projectSlug: string;
}

export async function resolveProject(
  authUserId: string,
  project: string,
): Promise<ResolvedProject> {
  const parts = project.split("/");
  if (parts.length !== 2) {
    throw new Error("project must be in account/slug format");
  }
  const [accountSlug, projectSlug] = parts;

  const projectRecord = await getProjectBySlugs(accountSlug, projectSlug);
  if (!projectRecord) {
    throw new Error(`Project not found: ${project}`);
  }

  const membership = await getProjectByAuthUserId(authUserId, projectRecord.id);
  if (!membership) {
    throw new Error(`Not a member of project: ${project}`);
  }

  return {
    projectId: projectRecord.id,
    memberAccountId: membership.memberAccountId,
    accountSlug,
    projectSlug,
  };
}
```

- [ ] **Step 2: Verify the registry exports exist**

Check that `getProjectBySlugs` exists in `src/members/registry.ts`. If it doesn't (the middleware uses separate calls), create it:

```ts
// Add to src/members/registry.ts if missing
export async function getProjectBySlugs(accountSlug: string, projectSlug: string) {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.slug, accountSlug),
  });
  if (!account) return null;
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.slug, projectSlug), eq(projects.accountId, account.id)),
  });
  return project;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/mcp/resolve-project.ts src/members/registry.ts
git commit -m "feat: add resolveProject helper for per-tool membership validation"
```

---

### Task 2: Add project param to all MCP tools

**Files:**
- Modify: `src/mcp/server.ts`

This is the largest task. Every tool gets a `project` param and resolves it before making API calls. The `createMcpServer` signature changes from project-scoped to user-scoped.

- [ ] **Step 1: Change `createMcpServer` signature**

Replace the current signature:
```ts
export function createMcpServer(
  projectId: string,
  memberAccountId: string,
  authorType: "human" | "agent",
  projectUrl?: string
): McpServer
```

With:
```ts
export function createMcpServer(
  authUserId: string,
  authorType: "human" | "agent",
  baseUrl: string,
): McpServer
```

- [ ] **Step 2: Update `createApiRequest` to be called per-tool**

Move `createApiRequest` calls from server creation to inside each tool handler. Each tool will:

1. Accept `project: z.string().describe("Project in account/slug format (e.g. srijan/sagaland)")`
2. Call `resolveProject(authUserId, project)`
3. Call `createApiRequest(resolved.projectId, resolved.memberAccountId, authorType)`
4. Make the API call

- [ ] **Step 3: Update each tool — add project param and per-call resolution**

For every tool, add the `project` param and wrap the handler with project resolution. Example for `kilroy_search`:

```ts
mcp.tool(
  "kilroy_search",
  "Search posts by keyword/phrase...",
  {
    project: z.string().describe("Project in account/slug format (e.g. srijan/sagaland)"),
    query: z.string().describe("Search query..."),
    // ... rest of existing params
  },
  async (params) => {
    let resolved;
    try {
      resolved = await resolveProject(authUserId, params.project);
    } catch (err: any) {
      return result({ error: err.message });
    }
    const apiRequest = createApiRequest(resolved.projectId, resolved.memberAccountId, authorType);
    // ... rest of existing handler, using apiRequest instead of app
  }
);
```

Apply this pattern to all 9 tools:
- `kilroy_search`
- `kilroy_read_post`
- `kilroy_tags`
- `kilroy_create_post`
- `kilroy_comment`
- `kilroy_update_post_status`
- `kilroy_delete_post`
- `kilroy_update_post`
- `kilroy_update_comment`

To avoid repetition, extract a helper:

```ts
async function withProject<T>(
  project: string,
  fn: (apiRequest: ReturnType<typeof createApiRequest>, projectUrl: string) => Promise<T>,
): Promise<T> {
  const resolved = await resolveProject(authUserId, project);
  const apiRequest = createApiRequest(resolved.projectId, resolved.memberAccountId, authorType);
  const projectUrl = `${baseUrl}/${resolved.accountSlug}/${resolved.projectSlug}`;
  return fn(apiRequest, projectUrl);
}
```

Then each tool becomes:

```ts
async (params) => {
  try {
    return await withProject(params.project, async (apiRequest, projectUrl) => {
      // existing handler body
    });
  } catch (err: any) {
    return result({ error: err.message });
  }
}
```

- [ ] **Step 4: Build and verify no type errors in mcp/server.ts**

```bash
bunx tsc --noEmit 2>&1 | grep "mcp/server"
```

Expected: No errors from mcp/server.ts.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat: add project param to all MCP tools, resolve membership per-call"
```

---

### Task 3: Add project management tools

**Files:**
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Add `kilroy_list_projects` tool**

```ts
mcp.tool(
  "kilroy_list_projects",
  "List projects you have access to.",
  {},
  async () => {
    const projects = await listProjectsForAuthUser(authUserId);
    return result(projects);
  }
);
```

- [ ] **Step 2: Add `kilroy_create_project` tool**

```ts
mcp.tool(
  "kilroy_create_project",
  "Create a new Kilroy project.",
  {
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/).describe("Project slug (3-40 chars, lowercase, hyphens)"),
  },
  async (params) => {
    const project = await createProjectForAuthUser(authUserId, params.slug);
    return result(project);
  }
);
```

- [ ] **Step 3: Add the backing functions to the registry**

Add `listProjectsForAuthUser` and `createProjectForAuthUser` to `src/members/registry.ts`. These should return `{ account_slug, project_slug, id }` shaped results. Check existing project creation logic in `src/routes/global-api.ts` or similar for the pattern to follow.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/server.ts src/members/registry.ts
git commit -m "feat: add kilroy_list_projects and kilroy_create_project management tools"
```

---

### Task 4: Simplify root `/mcp` endpoint

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Simplify the JWT verification — remove project claims requirement**

Replace the current `/mcp` handler (lines 154-207) with:

```ts
app.post("/mcp", async (c) => {
  const baseUrl = getBaseUrl(c.req.url);

  const authorization = c.req.header("Authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return c.text("Unauthorized", 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
    });
  }

  let payload;
  try {
    payload = await verifyAccessToken(accessToken, {
      jwksUrl: `${baseUrl}/api/auth/jwks`,
      verifyOptions: { issuer: `${baseUrl}/api/auth`, audience: `${baseUrl}/mcp` },
    });
  } catch {
    return c.text("Unauthorized", 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
    });
  }

  const sub = payload.sub as string | undefined;
  if (!sub) {
    return c.text("Missing user identity in token", 403);
  }

  const mcp = createMcpServer(sub, "agent", baseUrl);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  return await transport.handleRequest(c.req.raw);
});
```

- [ ] **Step 2: Remove the consent middleware**

Delete the `app.use("/api/auth/oauth2/consent", ...)` middleware block (lines 93-111 approximately).

- [ ] **Step 3: Remove `pending-projects.ts` import from server.ts**

Remove the `import { setPendingProject } from "./pending-projects"` line.

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "refactor: simplify /mcp endpoint to user-level JWT, remove consent middleware"
```

---

### Task 5: Simplify auth config

**Files:**
- Modify: `src/auth.ts`
- Delete: `src/pending-projects.ts`

- [ ] **Step 1: Remove project logic from oauthProvider config**

Replace the current `oauthProvider({...})` block with:

```ts
oauthProvider({
  loginPage: "/login",
  consentPage: "/consent",
  scopes: ["kilroy:access"],
  clientRegistrationDefaultScopes: ["kilroy:access"],
  validAudiences: [
    process.env.BETTER_AUTH_URL!,
    `${process.env.BETTER_AUTH_URL!}/mcp`,
  ],
  allowDynamicClientRegistration: true,
  allowUnauthenticatedClientRegistration: true,
  silenceWarnings: { oauthAuthServerConfig: true },
}),
```

Removed: `postLogin` block, `customAccessTokenClaims`, import of `getPendingProject`.

- [ ] **Step 2: Remove import of getPendingProject**

Delete `import { getPendingProject } from "./pending-projects";` from auth.ts.

- [ ] **Step 3: Delete `src/pending-projects.ts`**

```bash
rm src/pending-projects.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/auth.ts
git rm src/pending-projects.ts
git commit -m "refactor: remove project claims from OAuth, delete pending-projects"
```

---

### Task 6: Simplify consent page

**Files:**
- Modify: `web/src/views/ConsentView.tsx`

- [ ] **Step 1: Replace ConsentView with simple consent**

Replace the entire component with a simple "Allow access" consent page — no project selection, no project creation:

```tsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';

export function ConsentView() {
  const { user, account, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConsent = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/auth/oauth2/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          accept: true,
          oauth_query: window.location.search.slice(1),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error_description || data.error || 'Consent failed');
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      const redirectUrl = data.url || data.redirectTo;
      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    } catch {
      setError('Network error');
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (!user || !account) {
    window.location.href = `/login?callbackURL=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return null;
  }

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={28} />
          <h1 className="consent-title">Connect to Kilroy</h1>
        </div>

        <p className="landing-desc">
          Allow your agent to read and write to your Kilroy projects.
        </p>

        {error && <p className="landing-error consent-error">{error}</p>}

        <button
          className="login-btn login-btn-github consent-submit"
          onClick={handleConsent}
          disabled={submitting}
        >
          {submitting ? 'Connecting...' : 'Allow'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remove unused consent CSS**

In `web/src/index.css`, remove the `.consent-projects`, `.consent-project`, `.consent-create`, `.consent-create-label`, `.consent-create-row` classes. Keep `.consent-title`, `.consent-error`, `.consent-submit`.

- [ ] **Step 3: Build frontend**

```bash
cd web && npx vite build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/views/ConsentView.tsx web/src/index.css
git commit -m "refactor: simplify consent page to user-level auth, remove project picker"
```

---

### Task 7: Update project-scoped `/mcp` endpoint

**Files:**
- Modify: `src/server.ts`

The project-scoped endpoint should also use the new `createMcpServer` signature. Since the project is already in the URL, the tools' `project` param would be optional or pre-filled.

- [ ] **Step 1: Update the project-scoped MCP handler**

```ts
projectApp.all("/mcp", async (c) => {
  const projectId = c.get("projectId");
  const memberAccountId = c.get("memberAccountId");
  const authorType = c.get("authorType");
  const accountSlug = c.get("accountSlug");
  const projectSlug = c.get("projectSlug");
  const baseUrl = getBaseUrl(c.req.url);

  // For project-scoped endpoint, we still need the auth user ID.
  // The projectAuth middleware sets memberAccountId, which we can use.
  // Pass the account/project as default context.
  const mcp = createMcpServer(
    memberAccountId, // acts as user identity for project-scoped
    authorType,
    baseUrl,
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  return await transport.handleRequest(c.req.raw);
});
```

Note: The project-scoped endpoint will still require a `project` param on tool calls. The agent using this endpoint would pass `accountSlug/projectSlug` from the URL. This is consistent — same tools, same interface, regardless of which endpoint is used.

- [ ] **Step 2: Commit**

```bash
git add src/server.ts
git commit -m "refactor: update project-scoped MCP endpoint for new createMcpServer signature"
```

---

### Task 8: Update plugin skill and hooks

**Files:**
- Modify: `plugin/skills/using-kilroy/SKILL.md`
- Modify: `plugin/hooks/scripts/session-start.sh`

- [ ] **Step 1: Update `session-start.sh` to read project from `.kilroy/config.toml`**

Add project detection to the session-start hook. After existing env setup:

```bash
# Read project mapping from repo config
KILROY_CONFIG=".kilroy/config.toml"
if [[ -f "$KILROY_CONFIG" ]]; then
  KILROY_PROJECT=$(sed -n 's/^project[[:space:]]*=[[:space:]]*"\(.*\)"$/\1/p' "$KILROY_CONFIG" | head -n 1)
  if [[ -n "$KILROY_PROJECT" ]]; then
    echo "KILROY_PROJECT=$KILROY_PROJECT" >> "$CLAUDE_ENV_FILE"
  fi
fi
```

- [ ] **Step 2: Update `using-kilroy` skill to inject project context**

Add a section to SKILL.md that instructs the agent:

```markdown
## Project Routing

Check `.kilroy/config.toml` for the project mapping. If it exists and has a `project` field,
pass that value as the `project` parameter on every Kilroy tool call.

If no mapping exists:
1. Call `kilroy_list_projects` to see available projects
2. Ask the user which project this directory should use (or offer to create one with `kilroy_create_project`)
3. Save the mapping to `.kilroy/config.toml`:

\`\`\`toml
project = "account/slug"
\`\`\`
```

- [ ] **Step 3: Update the inject-context hook**

In `plugin/hooks/scripts/inject-context.sh`, no changes needed — it already injects `author_metadata` into tool calls, and the `project` param is handled by the agent, not the hook.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/using-kilroy/SKILL.md plugin/hooks/scripts/session-start.sh
git commit -m "feat: update plugin to read project mapping from .kilroy/config.toml"
```

---

### Task 9: Clean up and build

**Files:**
- Modify: `src/server.ts` (remove unused imports)

- [ ] **Step 1: Remove unused imports from server.ts**

Remove `getProjectByAuthUserId` import if no longer used directly in server.ts (it's now used in `resolve-project.ts`).

- [ ] **Step 2: Full type check**

```bash
bunx tsc --noEmit 2>&1 | grep -v node_modules
```

Fix any type errors.

- [ ] **Step 3: Build frontend**

```bash
cd web && npx vite build
```

- [ ] **Step 4: Test locally**

Start the server and verify:
1. OAuth flow works (no project picker in consent)
2. `kilroy_list_projects` returns projects
3. `kilroy_search` with `project: "account/slug"` works
4. Missing/wrong project param returns clear error

- [ ] **Step 5: Commit and bump version**

```bash
bash scripts/bump-version.sh 0.13.0
git add -A
git commit -m "feat: user-scoped OAuth with per-tool project routing"
```
