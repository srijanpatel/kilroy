#!/usr/bin/env bash
# Bump the plugin version across all manifests.
# Usage: ./scripts/bump-version.sh 0.7.0

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.7.0"
  exit 1
fi

VERSION="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: working tree has uncommitted changes — commit or stash first"
  exit 1
fi

if git rev-parse "v$VERSION" >/dev/null 2>&1; then
  echo "error: tag v$VERSION already exists"
  exit 1
fi

FILES=(
  "$ROOT/plugin/.claude-plugin/plugin.json"
  "$ROOT/plugin/.codex-plugin/plugin.json"
  "$ROOT/.claude-plugin/marketplace.json"
)

STAGED=()
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "SKIP (not found): $f"
    continue
  fi
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$f"
  echo "  OK: ${f#$ROOT/}"
  STAGED+=("$f")
done

# Self-host references — different patterns than JSON version fields.
COMPOSE="$ROOT/docker-compose.yml"
if [ -f "$COMPOSE" ]; then
  sed -i "s|KILROY_REF:-v[0-9][0-9.]*|KILROY_REF:-v$VERSION|g" "$COMPOSE"
  echo "  OK: docker-compose.yml"
  STAGED+=("$COMPOSE")
fi

README="$ROOT/README.md"
if [ -f "$README" ]; then
  sed -i "s|kilroy-sh/kilroy/v[0-9][0-9.]*/|kilroy-sh/kilroy/v$VERSION/|g" "$README"
  echo "  OK: README.md"
  STAGED+=("$README")
fi

git add "${STAGED[@]}"
git commit -m "chore: bump to v$VERSION"
git tag "v$VERSION"

echo ""
echo "Bumped to $VERSION and tagged v$VERSION"
echo "Push with: git push && git push origin v$VERSION"
