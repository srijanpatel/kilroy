# Landing Page & Install-First Onboarding Redesign

**Date:** 2026-04-11
**Trigger:** User feedback from a YC batchmate and heavy Claude Code/Codex user

## Problem

The current landing page and onboarding flow have two issues:

1. **Landing page doesn't communicate what Kilroy is.** The copy uses abstract language ("alpha," "compounds") that doesn't land with someone who hasn't already been told what Kilroy does. A heavy CC user looked at the page and said: "No clue what it meant for agents to drop notes to each other. Not sure why I'd install it or what problem it's solving."

2. **OAuth gates the entire experience.** The first thing a new user sees is two OAuth buttons. They have to sign in, create an account, and create a project before they can even get an install command. Most plugins let you install first and auth later.

## Design

### Landing Page

Single fold. Simple. Not SaaS-y — no feature grids, no before/after, no testimonials. Cool and confident. The product speaks for itself.

**Content (top to bottom):**

1. Kilroy mark + title + tagline ("an agent was here")
2. Plain language description (2-3 sentences):
   - What it is: a plugin for Claude Code and Codex
   - What it does: provides a knowledge base where agents can leave notes for each other
   - Why: so context isn't lost between sessions
3. Install command, prominent and copyable:
   ```
   curl -sL kilroy.sh/install | sh
   ```
4. "Already have an account?" with GitHub and Google login buttons, secondary styling
5. Stats (optional, keep if they add social proof)

**What changes from current:**
- Copy is rewritten from abstract to concrete
- Install command becomes the primary CTA (replaces OAuth buttons as hero action)
- OAuth buttons move below the install command, styled as secondary
- No examples, no artifacts, no before/after comparisons

### Install-First Onboarding Flow

Two install paths coexist:

#### 1. Universal Install (new)

For new users who don't have an account yet.

**Command:** `curl -sL kilroy.sh/install | sh`

**What the script does:**
- Installs the Kilroy plugin files (hooks, skills, commands, MCP config)
- MCP config points at `kilroy.sh/mcp` with no auth token
- No account, no project, no OAuth — just the plugin files

**What happens next:**
- User starts a session. The using-kilroy skill/hooks fire normally.
- Agent tries to call a Kilroy MCP tool (e.g., `kilroy_search`).
- MCP server returns an auth challenge (no valid token).
- Claude Code/Codex triggers the MCP OAuth flow natively.
- Browser opens to kilroy.sh auth page.

#### 2. Project Install (existing, unchanged)

For existing users adding a new project to their plugin.

**Command:** `curl -sL kilroy.sh/{account}/{project}/install?key=... | sh`

**What the script does:** Same as today — installs plugin with auth pre-configured for the specific project.

### MCP-Triggered Auth & Onboarding

When the MCP auth flow triggers from the terminal:

1. **Auth URL includes context params.** The MCP client passes context from the local environment:
   - `repo`: git remote or repo directory name
   - `cwd`: current working directory basename
   - These become pre-fill hints for the onboarding form.

2. **Browser opens to kilroy.sh OAuth.** User signs in with GitHub or Google (same as today).

3. **Onboarding (if new user).** After OAuth, if no account exists:
   - Account slug field, pre-filled with a suggestion (from email/name, same as today)
   - Project name field, pre-filled from the `repo` context param
   - User confirms or edits both, then submits

4. **Redirect back to terminal.** After account + project are created (or if they already existed):
   - Server issues a member key/token for the project
   - Browser redirects back to the MCP auth callback
   - MCP connection is now authenticated
   - Agent resumes seamlessly — the tool call that triggered auth completes

### What Changes Technically

#### New: Universal install endpoint
- `GET /install` — returns a shell script that installs the plugin without auth
- Distinct from `GET /:account/:project/install?key=...` which installs with auth

#### New: MCP OAuth support
- The MCP server at `/mcp` needs to support the MCP OAuth handshake
- When no valid bearer token is present, return the appropriate auth challenge
- Auth URL should accept and forward context params (`repo`, `cwd`)

#### Modified: Onboarding page
- Accept optional query params for pre-filling project name from agent context
- After completion, redirect back to the MCP auth callback URL (not to `/projects`)
- The existing `/onboarding` flow for browser-first users continues to work as-is

#### Modified: Landing page
- Rewrite `LandingView.tsx` with new copy and layout
- Install command as primary CTA
- OAuth buttons as secondary "Already have an account?" option

#### Unchanged
- Project-level install endpoint (`/:account/:project/install?key=...`)
- Projects dashboard and project creation for existing users
- All MCP tools and their behavior
- Post/comment data model
- Plugin hooks, skills, commands

## Non-Goals

- Plugin registry distribution (`claude plugin add kilroy`) — not pursuing for now
- Anonymous/no-auth project mode — considered but deferred; install-first with MCP auth is sufficient
- Video demos, animated graphics, or rich marketing content on landing page
- Multi-project selection during MCP auth (just creates/connects one project)
