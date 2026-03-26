# npm Package Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing Kilroy CLI as an npm package so agents can install it via `npm i -g kilroy-cli` or run it via `npx kilroy-cli`.

**Architecture:** Bundle `src/cli/index.ts` into a single JS file with `bun build --target node`. Ship in a `packages/cli/` directory with its own `package.json`. A build script handles bundling + shebang fix.

**Tech Stack:** Bun (build), Node 18+ (runtime), npm (distribution)

---

## File Structure

**Create:**
- `packages/cli/package.json` — npm package metadata
- `packages/cli/build.sh` — build script (bundle + fix shebang)
- `packages/cli/dist/kilroy.js` — bundled CLI (generated, gitignored)

**Modify:**
- `package.json` — add `build:cli` script
- `.gitignore` — ignore `packages/cli/dist/`

---

## Chunk 1: Package Setup and Build

### Task 1: Create the npm package structure

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/build.sh`
- Modify: `package.json` (root)
- Modify: `.gitignore`

- [ ] **Step 1: Create packages/cli directory**

```bash
mkdir -p packages/cli/dist
```

- [ ] **Step 2: Create packages/cli/package.json**

```json
{
  "name": "kilroy-cli",
  "version": "0.1.0",
  "description": "CLI for Kilroy — tribal knowledge for coding agents",
  "type": "module",
  "bin": {
    "kilroy": "dist/kilroy.js"
  },
  "files": [
    "dist"
  ],
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": [
    "kilroy",
    "cli",
    "knowledge",
    "agents"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/nickarora/kilroy"
  }
}
```

- [ ] **Step 3: Create packages/cli/build.sh**

```bash
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
```

- [ ] **Step 4: Add build:cli script to root package.json**

Add to `scripts` in the root `package.json`:

```json
"build:cli": "bash packages/cli/build.sh"
```

- [ ] **Step 5: Add dist to .gitignore**

Append to `.gitignore`:

```
packages/cli/dist/
```

- [ ] **Step 6: Run the build and verify**

```bash
bash packages/cli/build.sh
node packages/cli/dist/kilroy.js --help
node packages/cli/dist/kilroy.js --version
```

Expected: help output showing all 12 commands, version 0.1.0.

- [ ] **Step 7: Verify npx-style invocation works**

```bash
cd /tmp && node /home/ubuntu/kilroy/packages/cli/dist/kilroy.js --help
```

Expected: same help output from outside the project directory.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/package.json packages/cli/build.sh package.json .gitignore
git commit -m "cli: add npm package structure and build script"
```

### Task 2: Verify the package is publishable

**Files:** None (validation only)

- [ ] **Step 1: Dry-run npm pack to inspect what would be published**

```bash
cd packages/cli && npm pack --dry-run
```

Expected: lists `dist/kilroy.js` and `package.json`. Nothing else. Total size should be under 100KB.

- [ ] **Step 2: Verify the tarball contents**

```bash
cd packages/cli && npm pack && tar tzf kilroy-cli-0.1.0.tgz
```

Expected: `package/package.json` and `package/dist/kilroy.js` only.

- [ ] **Step 3: Clean up the tarball**

```bash
rm packages/cli/kilroy-cli-0.1.0.tgz
```

- [ ] **Step 4: Commit build output verification (no files to commit, just verify)**

No commit needed — this task is validation only.
