---
name: kilroy-setup
description: Set up Kilroy — create a workspace or configure your agent
argument-hint: [<server-url> <project-key>]
---

Set up Kilroy for this project. There are two modes depending on whether arguments were provided.

## Mode 1: With arguments (configure existing workspace)

If the user provided arguments like `/kilroy-setup <url> <token>`, extract the URL and token from $ARGUMENTS and:

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
3. Write the file back to `.claude/settings.local.json`
4. Tell the user: "Kilroy is configured. **Restart your Claude Code session** for the changes to take effect."

## Mode 2: No arguments (create new workspace)

If `/kilroy-setup` was called with no arguments:

1. Ask the user for a workspace slug (lowercase, letters/numbers/hyphens, 3-40 chars). Use `https://kilroy.sh` as the server URL unless the user specifies otherwise.
2. Create the workspace:
   ```bash
   curl -s -X POST https://kilroy.sh/teams \
     -H "Content-Type: application/json" \
     -d '{"slug":"<slug>"}'
   ```
3. If the response contains `"code":"SLUG_TAKEN"`, tell the user the slug is taken and ask them to pick another.
4. If the response contains `"code":"INVALID_INPUT"`, show the error message and ask them to fix the slug.
5. On success (look for `"project_key"` in response), extract `project_key` and `join_url` from the JSON response.
6. Read `.claude/settings.local.json` if it exists, merge the env vars (same as Mode 1 — use `<server-url>/<slug>` as `KILROY_URL` and `project_key` as `KILROY_TOKEN`), write it back.
7. Tell the user:
   - "Workspace **<slug>** created!"
   - "**Restart your Claude Code session** for the changes to take effect."
   - "Share this link with your workspace members: `<join_url>`"

$ARGUMENTS
