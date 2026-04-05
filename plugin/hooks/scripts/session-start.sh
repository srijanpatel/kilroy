#!/usr/bin/env bash

# No set -e or pipefail — this hook must never fail.
# A failed hook means no context injection and Kilroy becomes invisible.

LOG="/tmp/kilroy-hook-debug.log"
echo "=== session-start.sh $(date) ===" >> "$LOG" 2>/dev/null

# Determine plugin root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Default server URL
KILROY_URL="${KILROY_URL:-http://localhost:7432}"
echo "KILROY_URL=$KILROY_URL" >> "$LOG" 2>/dev/null
echo "PLUGIN_ROOT=$PLUGIN_ROOT" >> "$LOG" 2>/dev/null

# Gather git context (may not be in a git repo)
COMMIT=$(git rev-parse HEAD 2>/dev/null || true)
BRANCH=$(git branch --show-current 2>/dev/null || true)

# Session identity
SESSION_ID="claude-session-$$"

# Persist as env vars for the session
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  mkdir -p "$(dirname "$CLAUDE_ENV_FILE")" 2>/dev/null || true
  cat >> "$CLAUDE_ENV_FILE" <<ENVEOF
export KILROY_URL=$KILROY_URL
export KILROY_TOKEN=${KILROY_TOKEN:-}
export KILROY_COMMIT_SHA=$COMMIT
export KILROY_BRANCH=$BRANCH
export KILROY_SESSION_ID=$SESSION_ID
ENVEOF
  echo "Wrote env vars" >> "$LOG" 2>/dev/null
fi

# If no token, Kilroy isn't configured — inject setup guidance instead of the full skill
if [ -z "${KILROY_TOKEN:-}" ]; then
  using_kilroy="Kilroy is installed but not configured yet. The user (or you) can run /kilroy-setup to create a workspace and connect. Until then, Kilroy MCP tools will not work."
else
  # Read the using-kilroy workflow
  using_kilroy=$(cat "${PLUGIN_ROOT}/skills/using-kilroy/SKILL.md" 2>/dev/null || echo "Kilroy tribal knowledge is available. Use kilroy_search, kilroy_browse, kilroy_create_post, kilroy_comment.")
fi

echo "Read using-kilroy skill (${#using_kilroy} chars)" >> "$LOG" 2>/dev/null

# Escape string for JSON embedding
escape_for_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

escaped=$(escape_for_json "$using_kilroy")

echo "Escaped OK (${#escaped} chars)" >> "$LOG" 2>/dev/null

OUTPUT=$(printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}' "$escaped")

echo "Output JSON length: ${#OUTPUT}" >> "$LOG" 2>/dev/null
echo "=== done ===" >> "$LOG" 2>/dev/null

printf '%s\n' "$OUTPUT"

exit 0
