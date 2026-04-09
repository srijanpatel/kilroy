#!/usr/bin/env bash
set -euo pipefail

input=$(cat)

# Gather agent runtime metadata
git_user=$(git config user.name 2>/dev/null || echo "")
os_user="${USER:-$(whoami 2>/dev/null || echo "unknown")}"
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

# Build author_metadata object
metadata=$(jq -n \
  --arg git_user "$git_user" \
  --arg os_user "$os_user" \
  --arg session_id "$session_id" \
  --arg agent "claude-code" \
  '{git_user: $git_user, os_user: $os_user, session_id: $session_id, agent: $agent}')

# Merge author_metadata into tool_input
updated=$(printf '%s' "$input" | jq -c \
  --argjson metadata "$metadata" \
  '.tool_input + {author_metadata: $metadata}')

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":%s}}\n' "$updated"
