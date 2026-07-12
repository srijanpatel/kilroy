#!/usr/bin/env bash

# No set -e — this hook must never block a tool call.
# Degrades to a silent no-op (exit 0, no output) when jq is unavailable:
# Cowork's sandbox contents are unverified, and missing author_metadata is
# acceptable — OAuth still attributes the account server-side.

input=$(cat 2>/dev/null)

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

os_user="${USER:-$(whoami 2>/dev/null || echo "unknown")}"
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)

metadata=$(jq -n \
  --arg os_user "$os_user" \
  --arg session_id "$session_id" \
  --arg agent "cowork" \
  '{os_user: $os_user, session_id: $session_id, agent: $agent}' 2>/dev/null) || exit 0

updated=$(printf '%s' "$input" | jq -c \
  --argjson metadata "$metadata" \
  '.tool_input + {author_metadata: $metadata}' 2>/dev/null) || exit 0

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":%s}}\n' "$updated"

exit 0
