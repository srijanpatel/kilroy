#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT="$SCRIPT_DIR/dist/kilroy.js"

echo "Building kilroy CLI..."

# Bundle all CLI source into a single Node-compatible JS file
bun build "$ROOT_DIR/src/cli/index.ts" \
  --outfile "$OUT" \
  --target node \
  --minify

# Fix shebang: bun build emits #!/usr/bin/env bun, we need node
sed -i '1s|#!/usr/bin/env bun|#!/usr/bin/env node|' "$OUT"
# Remove the // @bun marker comment
sed -i '2{/^\/\/ @bun$/d}' "$OUT"

chmod +x "$OUT"

echo "Built $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
