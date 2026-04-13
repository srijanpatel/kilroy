#!/usr/bin/env bash
# Sync OpenCode plugin assets from kilroy-sh/kilroy → kilroy-sh/kilroy-opencode.
#
# The main repo is source-of-truth for both the plugin module (kilroy.js)
# and the using-kilroy skill (SKILL.md). The thin repo at
# kilroy-sh/kilroy-opencode exists only as a distribution target that
# OpenCode pulls via git+https://. This script mirrors both files into a
# local clone of the thin repo so changes can be reviewed and committed
# there.
#
# Usage:
#   scripts/sync-opencode-plugin.sh [destination-path]
#
# Defaults to ../kilroy-opencode relative to the main repo root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$REPO_ROOT/../kilroy-opencode}"

if [ ! -d "$DEST" ]; then
  printf 'Destination does not exist: %s\n' "$DEST" >&2
  printf 'Clone it first:\n  gh repo clone kilroy-sh/kilroy-opencode %q\n' "$DEST" >&2
  exit 1
fi

if [ ! -f "$DEST/kilroy.js" ]; then
  printf 'Destination does not look like kilroy-opencode (no kilroy.js): %s\n' "$DEST" >&2
  exit 1
fi

SRC_PLUGIN="$REPO_ROOT/plugin/.opencode-plugin/kilroy.js"
DEST_PLUGIN="$DEST/kilroy.js"
SRC_SKILL="$REPO_ROOT/plugin/skills/using-kilroy/SKILL.md"
DEST_SKILL="$DEST/skills/using-kilroy/SKILL.md"

if [ ! -f "$SRC_PLUGIN" ]; then
  printf 'Source plugin module not found: %s\n' "$SRC_PLUGIN" >&2
  exit 1
fi

if [ ! -f "$SRC_SKILL" ]; then
  printf 'Source skill not found: %s\n' "$SRC_SKILL" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST_PLUGIN")"
cp "$SRC_PLUGIN" "$DEST_PLUGIN"

mkdir -p "$(dirname "$DEST_SKILL")"
cp "$SRC_SKILL" "$DEST_SKILL"

printf 'Synced:\n  %s\n  → %s\n  %s\n  → %s\n\n' \
  "$SRC_PLUGIN" "$DEST_PLUGIN" "$SRC_SKILL" "$DEST_SKILL"

if (cd "$DEST" && git diff --quiet -- kilroy.js skills/); then
  printf 'No changes in %s.\n' "$DEST"
else
  printf 'Changes in %s:\n' "$DEST"
  (cd "$DEST" && git diff --stat -- kilroy.js skills/)
  printf '\nReview with: (cd %q && git diff)\n' "$DEST"
  printf 'Commit with: (cd %q && git add kilroy.js skills && git commit -m "chore: sync from kilroy main")\n' "$DEST"
fi
