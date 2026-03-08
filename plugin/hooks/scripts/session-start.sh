#!/usr/bin/env bash
set -euo pipefail

# Default server URL if not set
HEARSAY_URL="${HEARSAY_URL:-http://localhost:7432}"
echo "export HEARSAY_URL=$HEARSAY_URL" >> "$CLAUDE_ENV_FILE"

# Gather git context
COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")
BRANCH=$(git branch --show-current 2>/dev/null || echo "")

# Session identity
SESSION_ID="claude-session-$(head -c 4 /dev/urandom | od -A n -t x1 | tr -d ' \n')"

# Persist as env vars for the session
echo "export HEARSAY_COMMIT_SHA=$COMMIT" >> "$CLAUDE_ENV_FILE"
echo "export HEARSAY_BRANCH=$BRANCH" >> "$CLAUDE_ENV_FILE"
echo "export HEARSAY_SESSION_ID=$SESSION_ID" >> "$CLAUDE_ENV_FILE"
echo "export HEARSAY_CWD=${CLAUDE_PROJECT_DIR:-}" >> "$CLAUDE_ENV_FILE"

cat <<EOF
{
  "hookSpecificOutput": {
    "additionalContext": "Hearsay tribal knowledge is available. Use hearsay_browse or hearsay_search to find relevant posts. Use /hearsay-post to capture knowledge at the end of a session."
  }
}
EOF

exit 0
