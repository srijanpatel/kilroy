import { Hono } from "hono";
import { validateKey } from "../teams/registry";
import { getBaseUrl } from "../lib/url";

/**
 * GET /:team/install?token=... — serves a shell script that fully sets up
 * Kilroy for a project in one shot. Teammate runs:
 *
 *   curl -sL https://kilroyhere.dev/myteam/install?token=klry_proj_... | sh
 *
 * The script:
 *  1. Installs the Kilroy plugin via `claude plugin` CLI
 *  2. Configures KILROY_URL + KILROY_TOKEN in .claude/settings.local.json
 */
export const installHandler = new Hono();

installHandler.get("/", async (c) => {
  const url = new URL(c.req.url);
  const slug = url.pathname.split("/")[1];
  const token = c.req.query("token");

  if (!token) {
    return c.text(
      "echo 'Error: missing token. Use the join link from your team admin.'\nexit 1",
      400,
      { "Content-Type": "text/plain" },
    );
  }

  const result = await validateKey(slug, token);
  if (!result.valid) {
    return c.text(
      "echo 'Error: invalid token. Ask your team admin for a fresh join link.'\nexit 1",
      401,
      { "Content-Type": "text/plain" },
    );
  }

  const baseUrl = getBaseUrl(c.req.url);
  const teamUrl = `${baseUrl}/${slug}`;

  const script = generateInstallScript(teamUrl, token, slug);

  return c.text(script, 200, {
    "Content-Type": "text/plain",
    "Cache-Control": "no-store",
  });
});

function generateInstallScript(
  teamUrl: string,
  token: string,
  slug: string,
): string {
  const settingsJson = JSON.stringify(
    { env: { KILROY_URL: teamUrl, KILROY_TOKEN: token } },
    null,
    2,
  );

  const mergeSettingsJs = `
const fs = require('fs');
const next = ${settingsJson};
const path = '.claude/settings.local.json';
let prev = {};
try { prev = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
prev.env = Object.assign({}, prev.env || {}, next.env);
fs.writeFileSync(path, JSON.stringify(prev, null, 2) + '\\n');
`.trim();

  return `#!/usr/bin/env sh
# Kilroy installer for team "${slug}"
set -eu

# ── Preflight ──
if ! command -v claude >/dev/null 2>&1; then
  echo "Error: claude CLI not found. Install Claude Code first:"
  echo "  https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi

# Find a JS runtime for JSON merging
JS=""
if command -v node >/dev/null 2>&1; then JS=node;
elif command -v bun >/dev/null 2>&1; then JS=bun; fi

# ── 1. Install the Kilroy plugin ──
echo "Installing Kilroy plugin..."
claude plugin marketplace add srijanpatel/kilroy 2>/dev/null || true
claude plugin install kilroy@kilroy-marketplace --scope local

# ── 2. Configure team connection ──
echo "Configuring team ${slug}..."
mkdir -p .claude
SETTINGS=".claude/settings.local.json"
if [ -n "$JS" ]; then
  $JS -e '${esc(mergeSettingsJs)}'
else
  printf '%s\\n' '${esc(settingsJson)}' > "$SETTINGS"
fi

echo ""
echo "  Done. Kilroy is ready."
echo "  Start a new Claude Code session in this project to connect."
echo ""
`;
}

/** Escape a string for embedding in a single-quoted shell string. */
function esc(s: string): string {
  return s.replace(/'/g, "'\\''");
}
