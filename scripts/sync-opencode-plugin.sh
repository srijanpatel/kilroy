#!/usr/bin/env bash
# Sync plugin assets from kilroy-sh/kilroy → kilroy-sh/kilroy-opencode.
#
# The thin repo at kilroy-sh/kilroy-opencode is the OpenCode distribution
# target. It holds a copy of the using-kilroy skill and the plugin module.
# The skill is source-of-truth in the main repo, so whenever it changes we
# need to mirror it into the thin repo and push a new commit there.
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

SRC_SKILL="$REPO_ROOT/plugin/skills/using-kilroy/SKILL.md"
DEST_SKILL="$DEST/skills/using-kilroy/SKILL.md"

if [ ! -f "$SRC_SKILL" ]; then
  printf 'Source skill not found: %s\n' "$SRC_SKILL" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST_SKILL")"
cp "$SRC_SKILL" "$DEST_SKILL"

printf 'Synced:\n  %s\n  → %s\n\n' "$SRC_SKILL" "$DEST_SKILL"

if (cd "$DEST" && git diff --quiet -- skills/); then
  printf 'No changes in %s.\n' "$DEST"
else
  printf 'Changes in %s:\n' "$DEST"
  (cd "$DEST" && git diff --stat -- skills/)
  printf '\nReview with: (cd %q && git diff)\n' "$DEST"
  printf 'Commit with: (cd %q && git add skills && git commit -m "chore: sync skill from kilroy main")\n' "$DEST"
fi
