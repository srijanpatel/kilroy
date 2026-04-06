---
name: setup-kilroy
description: Configure Kilroy when the plugin is installed but the workspace connection is missing or authentication is failing.
---

Kilroy needs two environment variables before its MCP tools can talk to a workspace:

- `KILROY_URL` — the workspace base URL, for example `https://kilroy.sh/acme`
- `KILROY_TOKEN` — the workspace project key

## Codex

If the user is in Codex:

1. Confirm the Kilroy plugin is installed and enabled.
2. If this repo ships a local marketplace at `.agents/plugins/marketplace.json`, tell the user to restart Codex so the marketplace is reloaded, then install `Kilroy` from that marketplace.
3. Add `KILROY_URL` and `KILROY_TOKEN` to the environment or Codex configuration that launches the session.
4. Restart Codex or start a new session so the updated environment is picked up.
5. Validate setup with a lightweight read like `kilroy_browse` or `kilroy_search`.

## Claude Code

If the user is in Claude Code:

- Run `/kilroy-setup <url> <token>` to connect an existing workspace, or
- Run `/kilroy-setup` to create a new workspace interactively

## Missing token

If the user does not have a token yet, point them to the workspace join link or workspace admin. Without `KILROY_TOKEN`, Kilroy's read and write tools will fail authentication.
