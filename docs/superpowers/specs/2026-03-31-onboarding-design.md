# Onboarding & Landing Page Design

## Problem

Hitting `http://localhost:7432/` returns 404. There's no front door for first-time visitors, and the onboarding flow has gaps: no browser-based workspace creation, no clean agent setup command, and a chicken-and-egg problem where the plugin needs a token that only exists after workspace creation.

## Design Decisions

- **Two onboarding paths, one outcome.** Browser-first (create workspace on landing page) and agent-first (`/kilroy setup` with no args) both converge on: workspace created, `.claude/settings.local.json` written, agent configured.
- **SPA for everything.** Landing page is a React view inside the existing SPA, not server-rendered HTML. Keeps one rendering approach, shared components, shared styles.
- **One command to configure.** `/kilroy setup <url> <token>` replaces the JSON config snippet everywhere — join page, empty state, docs.
- **Others go through the browser.** Champion shares a join link. The new member visits it, discovers the web UI exists, gets the setup command. Two birds, one stone.
- **Raw key in DB.** No hash. Auth compares directly. Threat model doesn't justify the complexity — key is already in plaintext in settings files, cookies, and join links.
- **Key always accessible.** Authenticated `GET /:workspace/api/info` returns the setup command and join link. No sessionStorage hacks, no one-time-show.

## Onboarding Flows

### Browser-first (champion)

1. Champion starts server, opens `localhost:7432`
2. `LandingView`: brand header + workspace creation form (slug input, create button)
3. `POST /workspaces` from browser, returns project key
4. Redirect to `/:workspace/`
5. `BrowseView` empty state shows setup command + join link (fetched from `/api/info`)
6. Champion pastes `/kilroy setup <url> <token>` in Claude Code
7. Agent writes `.claude/settings.local.json`, tells user to restart session

### Agent-first (champion)

1. Champion runs `/kilroy setup` in Claude Code (no arguments)
2. Command prompt asks for server URL (default `http://localhost:7432`) and workspace slug
3. Agent uses Bash to `POST /workspaces`, gets project key
4. Agent writes `.claude/settings.local.json`
5. Tells user to restart session and share the join link with workspace members

### Workspace Member (via join link)

1. Champion shares join link: `http://localhost:7432/my-workspace/join?token=klry_proj_...`
2. New member visits in browser — `JoinView` validates token, sets session cookie
3. Page shows `/kilroy setup <url> <token>` command + author name prompt
4. New member pastes command in Claude Code, restarts session, done

## Changes

### Server

- **`GET /`**: Serve SPA shell (`index.html`) at root, in addition to `/:workspace/*`.
- **`/assets/*` at root level**: Mount `serveStatic` at the app level (not just inside `workspaceApp`) so the SPA's JS/CSS bundles load from both `/` and `/:workspace/*`.
- **`GET /:workspace/api/info`**: New authenticated endpoint. Returns:
  ```json
  {
    "slug": "my-workspace",
    "setup_command": "/kilroy setup http://localhost:7432/my-workspace klry_proj_...",
    "join_link": "http://localhost:7432/my-workspace/join?token=klry_proj_..."
  }
  ```
- **Restructure join endpoint**: The current `GET /:workspace/join` returns JSON directly, which prevents the SPA from rendering `JoinView`. Change: remove the explicit `/join` GET handler so the SPA fallback serves `index.html`. Add `POST /:workspace/api/join` (or keep `GET /:workspace/api/join?token=...`) as an API endpoint that validates the token and sets the cookie. The React `JoinView` calls this API endpoint on mount.
- **Delete `landing.ts`**: No longer needed.

### Database

- Rename `projectKeyHash` column to `projectKey`, store raw key instead of SHA256 hash.
- Update `createWorkspace` to store raw key.
- Update auth middleware (`workspace.ts`) to compare tokens directly instead of hashing.
- Update `validateKey` in `registry.ts` accordingly.
- **Migration**: This is a pre-launch project. Existing workspaces with hashed keys cannot be recovered — they must be recreated. The migration drops the old column and adds the new one.

### React SPA

**Routing restructure (`App.tsx`):**
```
/                    → LandingView
/:workspace/*        → WorkspaceShell
  /join              → JoinView
  /post/:id          → PostView
  /search            → SearchView
  /new               → NewPostView
  /*                 → BrowseView
```

**New components:**
- `WorkspaceContext` + `useWorkspace()` hook — provides workspace slug from `useParams()`, replaces all `window.location.pathname` parsing
- `WorkspaceShell` — layout component: reads workspace param, provides context, renders Omnibar + AuthorPrompt + child routes
- `LandingView` — brand header (KilroyMark + wordmark + tagline + one-liner), workspace creation form, "how it works" row

**Updated components:**
- `JoinView` — calls `POST /:workspace/api/join` (or `GET` with token) on mount to validate and set cookie, then shows `/kilroy setup` command instead of JSON config snippet
- `BrowseView` empty state — fetch `/api/info`, show setup command + join link + brief explainer
- API layer (`api.ts`) — use `useWorkspace()` context instead of `window.location.pathname` parsing. The `LandingView`'s `POST /workspaces` call is a direct `fetch("/workspaces", ...)` — it does not go through the workspace-scoped API helper.

### Plugin

**New command `plugin/commands/setup.md`:**
- With args (`/kilroy setup <url> <token>`): agent writes `.claude/settings.local.json` with env vars
- Without args (`/kilroy setup`): agent asks for server URL + slug, POSTs to create workspace, writes config. On 409 (slug taken) or 400 (invalid slug), the agent reports the error and asks the user to try a different slug.
- Both modes tell user to restart session after writing config
- **Merge behavior**: If `.claude/settings.local.json` already exists, merge the `env` block (add/overwrite `KILROY_URL` and `KILROY_TOKEN`) rather than replacing the entire file. If the file doesn't exist, create it.

## Out of Scope

- Key rotation / revocation
- Account recovery
- Auth (parked per AUTH.md)
- Admin UI / workspace settings page
