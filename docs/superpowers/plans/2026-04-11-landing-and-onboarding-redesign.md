# Landing Page & Install-First Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the landing page for clarity, add a universal install command, and implement MCP OAuth (via Better Auth OAuth Provider Plugin) so users can install the plugin first and authenticate later when the agent needs it.

**Architecture:** The landing page becomes a single-fold page with plain language copy and a `curl` install command as the primary CTA. A new universal install endpoint (`GET /install`) installs the plugin without auth. When an agent first tries to use a Kilroy MCP tool, the root `/mcp` endpoint returns 401 with OAuth metadata. Claude Code/Codex handle the OAuth flow natively via Better Auth's OAuth Provider Plugin — which handles metadata, client registration, authorization codes, PKCE, and token issuance. The user authenticates via GitHub/Google (existing Better Auth social login), completes onboarding if new, selects a project on the consent page, and gets redirected back. The JWT access token carries custom claims (`projectId`, `accountSlug`, `projectSlug`) so the MCP endpoint knows which project to scope to.

**Tech Stack:** Hono (server), React/React Router (frontend), PostgreSQL/Drizzle (data), `@better-auth/oauth-provider` + `better-auth/plugins/jwt` (OAuth 2.1), Better Auth (social login)

---

## File Structure

### New files
- `web/src/views/ConsentView.tsx` — OAuth consent page: project selection + optional project creation
- None in `src/` — the OAuth Provider Plugin handles OAuth routes internally via Better Auth

### Modified files
- `src/auth.ts` — add JWT plugin + OAuth Provider Plugin to Better Auth config
- `src/server.ts` — mount `/install`, `/mcp` (root), and `.well-known` metadata endpoints; add `/consent` SPA route
- `src/routes/install.ts` — add `universalInstallHandler` alongside existing project install
- `src/members/registry.ts` — add `getMemberByAuthUserId()` to resolve project from Better Auth user ID
- `src/db/index.ts` — run Better Auth migration for OAuth Provider tables
- `web/src/views/LandingView.tsx` — rewrite copy and layout
- `web/src/views/OnboardingView.tsx` — redirect to consent page (not projects dashboard) when in OAuth flow
- `web/src/App.tsx` — add `/consent` route
- `web/src/context/AuthContext.tsx` — update `signIn` to accept optional `callbackURL`
- `plugin/hooks/scripts/session-start.sh` — graceful no-token handling

---

### Task 1: Rewrite Landing Page

**Files:**
- Modify: `web/src/views/LandingView.tsx`
- Modify: CSS file (search for `.landing` styles)

- [ ] **Step 1: Rewrite the landing page component**

Replace the content of `web/src/views/LandingView.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';
import { GitHubIcon, GoogleIcon } from '../components/ProviderIcons';

export function LandingView() {
  const { user, account, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      localStorage.getItem('kilroy_theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    );
  }, []);

  useEffect(() => {
    if (loading) return;
    if (user && account) { navigate('/projects'); return; }
    if (user && !account) { navigate('/onboarding'); return; }
  }, [user, account, loading]);

  const installCmd = 'curl -sL kilroy.sh/install | sh';

  const handleCopy = () => {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return null;

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">Kilroy <span className="landing-tagline">&mdash; an agent was here.</span></h1>
        </div>

        <p className="landing-desc">
          Stop telling your agents the same thing twice. Kilroy is a plugin for
          Claude Code and Codex that remembers what you and your agents have
          learned &mdash; so future sessions start smarter, not from scratch.
        </p>

        <div className="install-cta" onClick={handleCopy} title="Click to copy">
          <code className="install-cmd">{installCmd}</code>
          <span className="install-copy">{copied ? 'Copied' : 'Copy'}</span>
        </div>

        <div className="landing-login">
          <span className="landing-login-label">Already have an account?</span>
          <div className="login-buttons login-buttons-secondary">
            <button className="login-btn login-btn-sm login-btn-github" onClick={() => signIn('github')}>
              <span className="login-btn-icon"><GitHubIcon /></span>
              GitHub
            </button>
            <button className="login-btn login-btn-sm login-btn-google" onClick={() => signIn('google')}>
              <span className="login-btn-icon"><GoogleIcon /></span>
              Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for the install CTA and secondary login buttons**

Find the landing page styles in the CSS (search for `.landing` in the main CSS file) and add:

```css
.install-cta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 2rem auto;
  padding: 0.875rem 1.25rem;
  background: var(--bg-code, #1a1a1a);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  cursor: pointer;
  max-width: 28rem;
  transition: border-color 0.15s;
}

.install-cta:hover {
  border-color: var(--accent, #C8642A);
}

.install-cmd {
  flex: 1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  color: var(--text-primary, #faf6f1);
  user-select: all;
}

.install-copy {
  font-size: 0.75rem;
  color: var(--text-secondary, #8c7e72);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.landing-login {
  margin-top: 2.5rem;
  text-align: center;
}

.landing-login-label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary, #8c7e72);
  margin-bottom: 0.75rem;
}

.login-buttons-secondary {
  justify-content: center;
  gap: 0.75rem;
}

.login-btn-sm {
  font-size: 0.8rem;
  padding: 0.5rem 1rem;
}
```

- [ ] **Step 3: Remove old stats fetch and unused CSS**

Remove the `stats` state, the `/api/stats` fetch useEffect, and the stats grid JSX from the old LandingView. Remove now-unused CSS classes (`.landing-desc-last`, `.landing-stats`, `.stats-grid`, etc.).

- [ ] **Step 4: Test in browser**

Run: `open http://localhost:5173`

Verify:
- Kilroy mark and title render
- Description is the P2 copy ("Stop telling your agents the same thing twice...")
- Install command is prominent and centered, clicking copies it
- "Already have an account?" with smaller GitHub/Google buttons below
- Logged-in users still redirect to /projects

- [ ] **Step 5: Commit**

```bash
git add web/src/views/LandingView.tsx
git commit -m "feat: rewrite landing page — clear copy, install CTA, secondary login"
```

---

### Task 2: Universal Install Endpoint

**Files:**
- Modify: `src/routes/install.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Extract shared Codex marketplace helper**

In `src/routes/install.ts`, the existing `generateInstallScript` function contains inline Python/JS scripts for Codex marketplace registration, plugin bundle installation, and plugin state management. Extract the marketplace registration + plugin bundle installation into a shared function `generateCodexPluginBlock()` that returns the shell script fragment. Both `generateInstallScript` (project install) and the new `generateUniversalInstallScript` will call this.

The shared function should include:
- The `install_codex_plugin_bundle()` shell function definition
- The marketplace registration block (Python/JS merge marketplace scripts)
- The plugin bundle installation to `~/.agents/plugins/kilroy` and cache dir

The project-specific install keeps the additional blocks: Codex MCP config (`codexConfigToml`), plugin state, and project trust.

- [ ] **Step 2: Add `generateUniversalInstallScript`**

Add below the existing `generateInstallScript`:

```typescript
export function generateUniversalInstallScript(baseUrl: string): string {
  const codexPluginBlock = generateCodexPluginBlock();
  const settingsJson = JSON.stringify(
    { env: { KILROY_URL: baseUrl } },
    null,
    2,
  );

  // Python and JS merge scripts for .claude/settings.local.json
  // Same pattern as generateInstallScript but only sets KILROY_URL (no KILROY_TOKEN)
  const mergeSettingsPy = `
import json
from pathlib import Path

payload = json.loads('''${settingsJson}''')
path = Path(".claude/settings.local.json")
current = {}
try:
    current = json.loads(path.read_text())
except Exception:
    current = {}

env = current.get("env")
if not isinstance(env, dict):
    env = {}
env.update(payload.get("env", {}))
current["env"] = env

path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(current, indent=2) + "\\n")
`.trim();

  const mergeSettingsJs = `
const fs = require('fs');
const next = ${settingsJson};
const path = '.claude/settings.local.json';
let prev = {};
try { prev = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
prev.env = Object.assign({}, prev.env || {}, next.env);
fs.writeFileSync(path, JSON.stringify(prev, null, 2) + '\\n');
`.trim();

  return `#!/usr/bin/env sh
# Kilroy universal installer
set -eu

PYTHON=""
if command -v python3 >/dev/null 2>&1; then PYTHON=python3;
elif command -v python >/dev/null 2>&1; then PYTHON=python; fi

JS=""
if command -v node >/dev/null 2>&1; then JS=node;
elif command -v bun >/dev/null 2>&1; then JS=bun; fi

CODEX_PLUGIN_READY=0
CLAUDE_READY=0

${codexPluginBlock}

# ── Configure Claude Code ──
if command -v claude >/dev/null 2>&1; then
  echo "Installing Kilroy plugin for Claude Code..."
  claude plugin marketplace add kilroy-sh/kilroy </dev/null 2>/dev/null || true
  if claude plugin install kilroy@kilroy-marketplace --scope local </dev/null; then
    mkdir -p .claude
    if [ -n "$PYTHON" ]; then
      "$PYTHON" - <<'PY'
${mergeSettingsPy}
PY
      CLAUDE_READY=1
    elif [ -n "$JS" ]; then
      $JS -e '${esc(mergeSettingsJs)}'
      CLAUDE_READY=1
    elif [ ! -f ".claude/settings.local.json" ]; then
      cat > ".claude/settings.local.json" <<'EOF_SETTINGS'
${settingsJson}
EOF_SETTINGS
      CLAUDE_READY=1
    fi
  fi
else
  echo "Claude Code not found; skipping."
fi

if [ "$CODEX_PLUGIN_READY" -ne 1 ] && [ "$CLAUDE_READY" -ne 1 ]; then
  echo "Error: could not configure Codex or Claude Code."
  exit 1
fi

echo ""
echo "  Done. Kilroy is installed."
echo "  Start a new session — Kilroy will prompt you to connect when needed."
echo ""
`;
}
```

- [ ] **Step 3: Add the universal install route handler**

```typescript
export const universalInstallHandler = new Hono();

universalInstallHandler.get("/", (c) => {
  const baseUrl = getBaseUrl(c.req.url);
  const script = generateUniversalInstallScript(baseUrl);
  return c.text(script, 200, {
    "Content-Type": "text/plain",
    "Cache-Control": "no-store",
  });
});
```

- [ ] **Step 4: Mount in server.ts**

In `src/server.ts`, import and mount before the project-scoped routes:

```typescript
import { universalInstallHandler } from "./routes/install";

// Universal install — no auth
app.route("/install", universalInstallHandler);
```

- [ ] **Step 5: Test**

Run: `curl -sL http://localhost:7432/install | head -5`

Expected: `#!/usr/bin/env sh` + `# Kilroy universal installer`

Run: `curl -sL http://localhost:7432/install | grep KILROY_TOKEN`

Expected: no output (no token in universal install)

Run: `curl -sL http://localhost:7432/install | grep KILROY_URL`

Expected: line containing `KILROY_URL` set to the server base URL

- [ ] **Step 6: Commit**

```bash
git add src/routes/install.ts src/server.ts
git commit -m "feat: add universal install endpoint at /install (no auth required)"
```

---

### Task 3: Better Auth OAuth Provider Plugin Setup

**Files:**
- Modify: `src/auth.ts`
- Modify: `src/db/index.ts`
- Modify: `package.json` (install dependency)

- [ ] **Step 1: Install the OAuth Provider Plugin**

```bash
bun add @better-auth/oauth-provider
```

- [ ] **Step 2: Configure the plugin in auth.ts**

Update `src/auth.ts` to add the JWT and OAuth Provider plugins:

```typescript
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as authSchema from "./db/auth-schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  tablePrefix: "ba_",
  emailAndPassword: { enabled: false },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [
    jwt(),
    oauthProvider({
      loginPage: "/login",
      consentPage: "/consent",
      allowDynamicClientRegistration: true,
    }),
  ],
});
```

- [ ] **Step 3: Add OAuth Provider tables to the database**

The OAuth Provider Plugin requires tables for clients, tokens, and consent. Add to `initDatabase()` in `src/db/index.ts`:

```typescript
  // OAuth Provider tables (for MCP auth flow)
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS ba_oauth_client (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL UNIQUE,
      client_secret TEXT,
      redirect_uris TEXT NOT NULL,
      client_name TEXT,
      client_uri TEXT,
      logo_uri TEXT,
      scope TEXT,
      grant_types TEXT,
      response_types TEXT,
      token_endpoint_auth_method TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ba_oauth_access_token (
      id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL UNIQUE,
      refresh_token TEXT UNIQUE,
      access_token_expires_at TIMESTAMPTZ NOT NULL,
      refresh_token_expires_at TIMESTAMPTZ,
      client_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES ba_session(id) ON DELETE CASCADE,
      scopes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ba_oauth_consent (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL,
      scopes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      consent_given BOOLEAN NOT NULL DEFAULT false
    );
  `);
```

Note: The exact schema may differ based on the plugin version. Run `bunx auth generate` to verify the expected schema, and adjust the DDL if needed.

- [ ] **Step 4: Test the setup**

Restart the server and check for errors:

Run: `bun run src/server.ts` (briefly, then Ctrl+C)

Expected: `Kilroy server running on http://localhost:7432` with no errors.

Verify the OAuth metadata endpoint works:

Run: `curl -s http://localhost:7432/api/auth/.well-known/oauth-authorization-server | jq .`

Expected: JSON with `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, etc.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lockb src/auth.ts src/db/index.ts
git commit -m "feat: add Better Auth OAuth Provider Plugin for MCP auth"
```

---

### Task 4: Root-Level MCP Endpoint

**Files:**
- Modify: `src/server.ts`
- Modify: `src/members/registry.ts`

- [ ] **Step 1: Add helper to resolve project from Better Auth user ID**

In `src/members/registry.ts`, add a function that finds a member's project by their Better Auth user ID. This is used by the root MCP endpoint to resolve the project from the JWT claims.

```typescript
export async function getProjectByAuthUserId(authUserId: string, projectId: string) {
  const rows = await db
    .select({
      projectId: projectMembers.projectId,
      memberAccountId: projectMembers.accountId,
      accountSlug: accounts.slug,
      projectSlug: projects.slug,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .innerJoin(accounts, eq(projects.accountId, accounts.id))
    .where(
      and(
        eq(accounts.authUserId, authUserId),
        eq(projectMembers.projectId, projectId)
      )
    );

  if (rows.length === 0) return null;

  return rows[0];
}
```

- [ ] **Step 2: Add protected resource metadata endpoint**

In `src/server.ts`, add the `.well-known/oauth-protected-resource` endpoint for MCP clients to discover the authorization server:

```typescript
// Protected Resource Metadata for root MCP endpoint (RFC 9728)
app.get("/.well-known/oauth-protected-resource", (c) => {
  const baseUrl = getBaseUrl(c.req.url);
  return c.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [`${baseUrl}/api/auth`],
    bearer_methods_supported: ["header"],
  });
});
```

Note: some MCP clients look for this at the MCP server URL path. Add it there too:

```typescript
app.get("/mcp/.well-known/oauth-protected-resource", (c) => {
  const baseUrl = getBaseUrl(c.req.url);
  return c.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [`${baseUrl}/api/auth`],
    bearer_methods_supported: ["header"],
  });
});
```

- [ ] **Step 3: Add the root-level MCP endpoint**

In `src/server.ts`, add the `/mcp` route after the metadata endpoints, before the project-scoped routes:

```typescript
import { createAuthClient } from "better-auth/client";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { getProjectByAuthUserId } from "./members/registry";

// Create a server-side auth client for token verification
const serverAuthClient = createAuthClient({
  plugins: [oauthProviderResourceClient(auth)],
});

// Root-level MCP endpoint — verifies JWT, resolves project from claims
app.all("/mcp", async (c) => {
  const baseUrl = getBaseUrl(c.req.url);

  // Check for bearer token
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.length <= 7) {
    return c.json(
      { error: "invalid_token", error_description: "Missing Authorization header" },
      401,
      {
        "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
      }
    );
  }

  const accessToken = authHeader.slice(7);

  // Verify the JWT access token via Better Auth
  let payload: any;
  try {
    payload = await serverAuthClient.verifyAccessToken(accessToken, {
      verifyOptions: {
        issuer: `${baseUrl}/api/auth`,
      },
    });
  } catch {
    return c.json(
      { error: "invalid_token", error_description: "Invalid access token" },
      401,
      {
        "WWW-Authenticate": `Bearer error="invalid_token", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
      }
    );
  }

  // Read project info from custom JWT claims
  const projectId = payload.projectId;
  const userId = payload.sub || payload.userId;

  if (!projectId || !userId) {
    return c.json(
      { error: "invalid_token", error_description: "Token missing project claims" },
      401,
    );
  }

  // Verify the user actually has access to this project
  const membership = await getProjectByAuthUserId(userId, projectId);
  if (!membership) {
    return c.json(
      { error: "insufficient_scope", error_description: "No access to project" },
      403,
    );
  }

  // Create MCP server scoped to the resolved project
  const projectUrl = `${baseUrl}/${membership.accountSlug}/${membership.projectSlug}`;
  const mcp = createMcpServer(membership.projectId, membership.memberAccountId, "agent", projectUrl);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  return transport.handleRequest(c.req.raw);
});
```

- [ ] **Step 4: Test the endpoint returns 401 without auth**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:7432/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'
```

Expected: `401`

Run:
```bash
curl -s -D - -X POST http://localhost:7432/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' 2>&1 | grep WWW-Authenticate
```

Expected: `WWW-Authenticate: Bearer resource_metadata="..."` header present.

- [ ] **Step 5: Test metadata endpoints**

Run: `curl -s http://localhost:7432/.well-known/oauth-protected-resource | jq .`

Expected: JSON with `resource`, `authorization_servers`, `bearer_methods_supported`.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts src/members/registry.ts
git commit -m "feat: root-level /mcp endpoint with JWT verification and OAuth metadata"
```

---

### Task 5: Consent Page (Project Selection)

**Files:**
- Create: `web/src/views/ConsentView.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/context/AuthContext.tsx`
- Modify: `src/server.ts`

This is the OAuth consent page. When the OAuth Provider Plugin redirects here, the user selects which project to connect (or creates a new one). The page then calls the Better Auth consent API with the selected project scope, and the flow completes.

- [ ] **Step 1: Update AuthContext to support callbackURL**

In `web/src/context/AuthContext.tsx`, update the `signIn` function signature and implementation:

```typescript
// Update interface
signIn: (provider: string, callbackURL?: string) => Promise<void>;

// Update implementation
const signIn = async (provider: string, callbackURL?: string) => {
  await authClient.signIn.social({
    provider: provider as "github" | "google",
    callbackURL: callbackURL || "/",
  });
};
```

- [ ] **Step 2: Create ConsentView**

Create `web/src/views/ConsentView.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';

interface Project {
  id: string;
  slug: string;
  account_slug: string;
}

export function ConsentView() {
  const { user, account, loading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [newProjectSlug, setNewProjectSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // OAuth params from query string (passed by Better Auth OAuth Provider)
  const params = new URLSearchParams(window.location.search);
  const clientId = params.get('client_id') || '';
  const scope = params.get('scope') || '';

  useEffect(() => {
    if (loading || !user || !account) return;
    // Fetch user's projects
    fetch('/api/projects', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const owned = data.owned || [];
        setProjects(owned);
        if (owned.length === 1) {
          setSelectedProjectId(owned[0].id);
        }
      })
      .catch(() => {});
  }, [user, account, loading]);

  const slugPattern = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

  const handleCreateProject = async () => {
    if (!slugPattern.test(newProjectSlug)) {
      setError('3-40 characters, lowercase letters, numbers, and hyphens');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug: newProjectSlug }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create project');
        return;
      }
      const project = await res.json();
      setProjects(prev => [...prev, { id: project.id, slug: project.slug, account_slug: account!.slug }]);
      setSelectedProjectId(project.id);
      setNewProjectSlug('');
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  };

  const handleConsent = async () => {
    if (!selectedProjectId) {
      setError('Select a project to connect');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      // Find the selected project details
      const project = projects.find(p => p.id === selectedProjectId);
      if (!project) return;

      // Build scope with project claims
      // The custom scope encodes the project for the JWT custom claims
      const projectScope = `project:${project.id}:${project.account_slug}:${project.slug}`;
      const fullScope = scope ? `${scope} ${projectScope}` : projectScope;

      // Call Better Auth consent API
      const res = await fetch('/api/auth/oauth2/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          accept: true,
          scope: fullScope,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Consent failed');
        setSubmitting(false);
        return;
      }

      // Better Auth handles the redirect back to the MCP client
      const data = await res.json();
      if (data.redirectTo) {
        window.location.href = data.redirectTo;
      }
    } catch {
      setError('Network error');
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (!user || !account) {
    // Not authenticated — shouldn't happen (OAuth Provider redirects to login first)
    // but handle gracefully
    window.location.href = `/login?callbackURL=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return null;
  }

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={28} />
          <h1 className="landing-title" style={{ fontSize: '1.3rem' }}>Connect to Kilroy</h1>
        </div>

        <p className="landing-desc">
          Select a project to connect your agent to.
        </p>

        {projects.length > 0 && (
          <div className="consent-projects">
            {projects.map(p => (
              <label key={p.id} className={`consent-project ${selectedProjectId === p.id ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="project"
                  value={p.id}
                  checked={selectedProjectId === p.id}
                  onChange={() => setSelectedProjectId(p.id)}
                />
                <span className="consent-project-slug">{p.account_slug}/{p.slug}</span>
              </label>
            ))}
          </div>
        )}

        <div className="consent-create">
          <p className="consent-create-label">Or create a new project:</p>
          <div className="consent-create-row">
            <input
              className="onboarding-input"
              type="text"
              value={newProjectSlug}
              onChange={e => setNewProjectSlug(e.target.value.toLowerCase())}
              placeholder="new-project"
            />
            <button
              className="login-btn login-btn-sm login-btn-github"
              onClick={handleCreateProject}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>

        {error && <p className="onboarding-error">{error}</p>}

        <button
          className="login-btn login-btn-github"
          onClick={handleConsent}
          disabled={submitting || !selectedProjectId}
          style={{ marginTop: '1.5rem', width: '100%' }}
        >
          {submitting ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add consent route to App.tsx**

In `web/src/App.tsx`:

```typescript
import { ConsentView } from './views/ConsentView';

// Inside <Routes>:
<Route path="/consent" element={<ConsentView />} />
```

- [ ] **Step 4: Add SPA route in server.ts**

In `src/server.ts`, add alongside the other SPA routes:

```typescript
app.get("/consent", (c) => c.html(indexHtml));
```

- [ ] **Step 5: Configure custom JWT claims for project info**

In `src/auth.ts`, add `customAccessTokenClaims` to the OAuth Provider config so the JWT includes project information when a `project:*` scope is granted:

```typescript
oauthProvider({
  loginPage: "/login",
  consentPage: "/consent",
  allowDynamicClientRegistration: true,
  customAccessTokenClaims: async (token) => {
    // Parse project scope: "project:{id}:{accountSlug}:{projectSlug}"
    const scopes = (token.scopes || "").split(" ");
    const projectScope = scopes.find((s: string) => s.startsWith("project:"));
    if (!projectScope) return {};

    const [, projectId, accountSlug, projectSlug] = projectScope.split(":");
    return { projectId, accountSlug, projectSlug };
  },
}),
```

- [ ] **Step 6: Test the consent page in browser**

Navigate to: `http://localhost:5173/consent?client_id=test&scope=openid`

Verify:
- Shows "Connect to Kilroy" with project selection
- Lists user's existing projects (if signed in with an account)
- Has "create new project" form
- Connect button is disabled until a project is selected

- [ ] **Step 7: Commit**

```bash
git add web/src/views/ConsentView.tsx web/src/context/AuthContext.tsx web/src/App.tsx src/server.ts src/auth.ts
git commit -m "feat: consent page with project selection for MCP OAuth flow"
```

---

### Task 6: Onboarding Flow Update

**Files:**
- Modify: `web/src/views/OnboardingView.tsx`

The existing onboarding flow (account slug + project creation) needs to redirect to the consent page instead of the projects dashboard when triggered during an OAuth flow.

- [ ] **Step 1: Detect OAuth flow in OnboardingView**

The OAuth flow passes through login → onboarding → consent. After the user creates their account (and optionally a project), redirect to the consent page with the original OAuth params preserved.

In `web/src/views/OnboardingView.tsx`, check for OAuth params in the URL or session. If the referrer is an OAuth authorization flow, redirect to `/consent` instead of `/projects` after onboarding:

```typescript
// At the top of the component, check for OAuth flow
const searchParams = new URLSearchParams(window.location.search);
const isOAuthFlow = searchParams.has('client_id') || sessionStorage.getItem('oauth_flow') === 'true';

// Preserve OAuth context through onboarding
useEffect(() => {
  if (searchParams.has('client_id')) {
    sessionStorage.setItem('oauth_flow', 'true');
    sessionStorage.setItem('oauth_params', searchParams.toString());
  }
}, []);

// When onboarding completes (account + project created), redirect:
const handleComplete = () => {
  if (isOAuthFlow) {
    const oauthParams = sessionStorage.getItem('oauth_params') || '';
    sessionStorage.removeItem('oauth_flow');
    sessionStorage.removeItem('oauth_params');
    navigate(`/consent?${oauthParams}`);
  } else {
    navigate('/projects');
  }
};
```

- [ ] **Step 2: Wire up the redirect in the "ready" step**

Replace the current navigation to `/projects` (or the project dashboard) in the final onboarding step with the `handleComplete()` function defined above.

- [ ] **Step 3: Test**

1. Sign in as a new user (no Kilroy account)
2. Verify onboarding shows account slug + project creation
3. After completing onboarding, verify redirect goes to `/consent` (not `/projects`) when OAuth params are present
4. Verify normal (non-OAuth) onboarding still goes to `/projects`

- [ ] **Step 4: Commit**

```bash
git add web/src/views/OnboardingView.tsx
git commit -m "feat: redirect onboarding to consent page during OAuth flow"
```

---

### Task 7: Update Plugin Session-Start Hook

**Files:**
- Modify: `plugin/hooks/scripts/session-start.sh`

- [ ] **Step 1: Update the no-token message**

In `plugin/hooks/scripts/session-start.sh`, find:

```bash
if [ -z "${KILROY_TOKEN:-}" ]; then
  using_kilroy="Kilroy is installed but not configured yet. Re-run the install script from the project's web dashboard to connect. Until then, Kilroy MCP tools will not work."
```

Replace with:

```bash
if [ -z "${KILROY_TOKEN:-}" ]; then
  using_kilroy="Kilroy is installed. When you use a Kilroy tool, your agent client will prompt you to sign in and connect a project. Just follow the browser prompt."
```

- [ ] **Step 2: Test the hook**

Run:
```bash
unset KILROY_TOKEN
echo '{}' | CLAUDE_ENV_FILE=/tmp/test-env bash plugin/hooks/scripts/session-start.sh
```

Expected: JSON with `additionalContext` containing the new guidance message.

- [ ] **Step 3: Commit**

```bash
git add plugin/hooks/scripts/session-start.sh
git commit -m "feat: update session-start hook for MCP OAuth flow"
```

---

### Task 8: Integration Test

- [ ] **Step 1: Test the full flow end-to-end**

With the dev server running:

1. **Landing page:** Visit `http://localhost:5173` — verify new copy ("Stop telling your agents the same thing twice...") and install command
2. **Universal install:** Run `curl -sL http://localhost:7432/install | head -5` — verify script starts with `#!/usr/bin/env sh` and `# Kilroy universal installer`
3. **OAuth metadata:** Run `curl -s http://localhost:7432/api/auth/.well-known/oauth-authorization-server | jq .` — verify JSON with authorization/token endpoints
4. **Protected resource metadata:** Run `curl -s http://localhost:7432/.well-known/oauth-protected-resource | jq .` — verify JSON pointing to authorization server
5. **MCP 401:** Run `curl -s -D - -X POST http://localhost:7432/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' 2>&1 | head -10` — verify 401 with `WWW-Authenticate` header
6. **Consent page:** Visit `http://localhost:5173/consent?client_id=test&scope=openid` while signed in — verify project selection UI
7. **Existing project install:** Run `curl -sL http://localhost:7432/{account}/{project}/install?key={existing_key} | head -5` — verify project-specific install script still works

- [ ] **Step 2: Fix any issues found during integration testing**

```bash
git add -A
git commit -m "fix: integration test fixes for MCP OAuth flow"
```

---

## Ordering & Dependencies

```
Task 1 (Landing Page) ─────────── independent
Task 2 (Universal Install) ────── independent
Task 7 (Plugin Hook Update) ───── independent

Task 3 (BA OAuth Plugin Setup) ── Task 4 (Root MCP Endpoint) ── Task 5 (Consent Page) ── Task 6 (Onboarding Update)

Task 8 (Integration Test) ─────── depends on all above
```

Tasks 1, 2, and 7 can run in parallel. Tasks 3→4→5→6 are sequential. Task 8 is last.
