#!/usr/bin/env bash

# No set -e or pipefail — this hook must never fail.
# A failed hook means no context injection and Kilroy becomes invisible.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

using_kilroy=$(cat "${PLUGIN_ROOT}/skills/using-kilroy/SKILL.md" 2>/dev/null || echo "Kilroy is available. Use kilroy_search, kilroy_read_post, kilroy_create_post, kilroy_comment. Pass project explicitly on every call — kilroy_list_projects shows what you can access.")

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

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$escaped"

exit 0
