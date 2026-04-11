import { Hono } from "hono";
import { readFileSync, readdirSync } from "fs";
import { posix, resolve } from "path";
import { validateMemberKey } from "../members/registry";
import { getBaseUrl } from "../lib/url";
import { mintProjectJwt } from "./token";

/**
 * GET /install — serves a universal install script (no project, no token).
 * Sets up the Kilroy plugin; OAuth handles auth at session start.
 *
 *   curl -sL https://kilroy.sh/install | sh
 */
export const universalInstallHandler = new Hono();

universalInstallHandler.get("/", (c) => {
  const baseUrl = getBaseUrl(c.req.url);
  const script = generateUniversalInstallScript(baseUrl);
  return c.text(script, 200, {
    "Content-Type": "text/plain",
    "Cache-Control": "no-store",
  });
});

/**
 * GET /:account/:project/install?key=... — serves a shell script that fully
 * sets up Kilroy for a project in one shot. Teammate runs:
 *
 *   curl -sL https://kilroy.sh/acme/my-project/install?key=klry_proj_... | sh
 *
 * The script:
 *  1. Installs and enables a home-local Codex plugin bundle for Kilroy skills
 *  2. Configures Codex via repo-local `.codex/config.toml`
 *  3. Installs the Kilroy plugin in Claude Code when `claude` is available
 *  4. Configures KILROY_URL + KILROY_TOKEN (JWT) in `.claude/settings.local.json`
 */
export const installHandler = new Hono();

type InstallFile = {
  path: string;
  content: string;
};

installHandler.get("/", async (c) => {
  const url = new URL(c.req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const accountSlug = segments[0];
  const projectSlug = segments[1];
  const key = c.req.query("key");
  const legacyToken = c.req.query("token");

  if (!key && legacyToken) {
    return c.text(
      "echo 'Error: the ?token= parameter is no longer supported.'\necho 'Ask your project admin for a fresh install link using ?key=.'\nexit 1",
      400,
      { "Content-Type": "text/plain" },
    );
  }

  if (!key) {
    return c.text(
      "echo 'Error: missing key. Use the install link from your project admin.'\nexit 1",
      400,
      { "Content-Type": "text/plain" },
    );
  }

  const result = await validateMemberKey(accountSlug, projectSlug, key);
  if (!result.valid) {
    return c.text(
      "echo 'Error: invalid key. Ask your project admin for a fresh install link.'\nexit 1",
      401,
      { "Content-Type": "text/plain" },
    );
  }

  const baseUrl = getBaseUrl(c.req.url);
  const projectUrl = `${baseUrl}/${accountSlug}/${projectSlug}`;

  // Exchange member key for a JWT — this becomes KILROY_TOKEN
  const jwt = await mintProjectJwt(
    result.projectId,
    result.memberAccountId,
    accountSlug,
    projectSlug,
  );

  const script = generateInstallScript(projectUrl, jwt, projectSlug);

  return c.text(script, 200, {
    "Content-Type": "text/plain",
    "Cache-Control": "no-store",
  });
});

// ─── Shared merge-script generators ────────────────────────────────────────

function mergeSettingsScripts(settingsJson: string) {
  const py = `
import json
from pathlib import Path

payload = json.loads('''${settingsJson}''')
path = Path(".claude/settings.local.json")
current = {}
try:
    current = json.loads(path.read_text())
except Exception:
    current = {}

env = current.get("env")
if not isinstance(env, dict):
    env = {}
env.update(payload.get("env", {}))
current["env"] = env

path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(current, indent=2) + "\\n")
`.trim();

  const js = `
const fs = require('fs');
const next = ${settingsJson};
const path = '.claude/settings.local.json';
let prev = {};
try { prev = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
prev.env = Object.assign({}, prev.env || {}, next.env);
fs.writeFileSync(path, JSON.stringify(prev, null, 2) + '\\n');
`.trim();

  return { py, js };
}

function codexMarketplaceScripts() {
  const entryJson = JSON.stringify({
    name: "kilroy",
    source: { source: "local", path: "./kilroy" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Productivity",
  });

  const py = `
import json
from pathlib import Path

path = Path.home() / ".agents/plugins/marketplace.json"
entry = json.loads('''${entryJson}''')

marketplace = {}
try:
    marketplace = json.loads(path.read_text())
except Exception:
    marketplace = {}
if not isinstance(marketplace, dict):
    marketplace = {}

name = marketplace.get("name")
if not isinstance(name, str) or not name.strip():
    name = "personal-plugins"

interface = marketplace.get("interface")
if not isinstance(interface, dict):
    interface = {}
display_name = interface.get("displayName")
if not isinstance(display_name, str) or not display_name.strip():
    interface["displayName"] = "Personal Plugins"

plugins = marketplace.get("plugins")
if not isinstance(plugins, list):
    plugins = []

next_plugins = []
replaced = False
for plugin in plugins:
    if isinstance(plugin, dict) and plugin.get("name") == entry["name"]:
        next_plugins.append(entry)
        replaced = True
    else:
        next_plugins.append(plugin)
if not replaced:
    next_plugins.append(entry)

marketplace["name"] = name
marketplace["interface"] = interface
marketplace["plugins"] = next_plugins

path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(marketplace, indent=2) + "\\n")
print(name)
`.trim();

  const js = `
const fs = require('fs');
const path = require('path');
const marketplacePath = path.join(process.env.HOME || '', '.agents/plugins/marketplace.json');
const entry = ${entryJson};

let marketplace = {};
try { marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8')); } catch {}
if (!marketplace || typeof marketplace !== 'object' || Array.isArray(marketplace)) {
  marketplace = {};
}

const marketplaceName =
  typeof marketplace.name === 'string' && marketplace.name.trim()
    ? marketplace.name
    : 'personal-plugins';

const marketplaceInterface =
  marketplace.interface && typeof marketplace.interface === 'object' && !Array.isArray(marketplace.interface)
    ? marketplace.interface
    : {};
if (typeof marketplaceInterface.displayName !== 'string' || !marketplaceInterface.displayName.trim()) {
  marketplaceInterface.displayName = 'Personal Plugins';
}

const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
let replaced = false;
const nextPlugins = plugins.map((plugin) => {
  if (plugin && typeof plugin === 'object' && plugin.name === entry.name) {
    replaced = true;
    return entry;
  }
  return plugin;
});
if (!replaced) {
  nextPlugins.push(entry);
}

marketplace.name = marketplaceName;
marketplace.interface = marketplaceInterface;
marketplace.plugins = nextPlugins;

fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
fs.writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\\n');
process.stdout.write(marketplaceName);
`.trim();

  return { py, js };
}

function codexPluginStateScripts() {
  const py = `
import os
from pathlib import Path

marketplace_name = os.environ["KILROY_CODEX_MARKETPLACE"]
section = f'[plugins."kilroy@{marketplace_name}"]\\nenabled = true\\n'
path = Path.home() / ".codex/config.toml"
text = path.read_text() if path.exists() else ""
lines = text.splitlines(keepends=True)
section_lines = section.splitlines(keepends=True)
header = f'[plugins."kilroy@{marketplace_name}"]'
start = None

for i, line in enumerate(lines):
    if line.strip() == header:
        start = i
        break

if start is not None:
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].startswith("["):
            end = i
            break
    lines = lines[:start] + section_lines + lines[end:]
    text = "".join(lines)
else:
    if text and not text.endswith("\\n"):
        text += "\\n"
    if text:
        text += "\\n"
    text += section

path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(text)
`.trim();

  const js = `
const fs = require('fs');
const path = require('path');
const marketplaceName = process.env.KILROY_CODEX_MARKETPLACE;
const configPath = path.join(process.env.HOME || '', '.codex/config.toml');
const section = \`[plugins."kilroy@\${marketplaceName}"]\\nenabled = true\\n\`;
let text = '';
try { text = fs.readFileSync(configPath, 'utf8'); } catch {}
const lines = text ? text.split(/(?<=\\n)/) : [];
const header = \`[plugins."kilroy@\${marketplaceName}"]\`;
const sectionLines = section.split(/(?<=\\n)/);
const start = lines.findIndex((line) => line.trim() === header);
if (start !== -1) {
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('[')) {
      end = i;
      break;
    }
  }
  text = [...lines.slice(0, start), ...sectionLines, ...lines.slice(end)].join('');
} else {
  if (text && !text.endsWith('\\n')) text += '\\n';
  if (text) text += '\\n';
  text += section;
}
fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, text);
`.trim();

  return { py, js };
}

function codexConfigScripts(codexConfigToml: string) {
  const py = `
from pathlib import Path

path = Path(".codex/config.toml")
section = '''${codexConfigToml}'''
text = path.read_text() if path.exists() else ""
lines = text.splitlines(keepends=True)
section_lines = section.splitlines(keepends=True)
start = None

for i, line in enumerate(lines):
    if line.strip() == "[mcp_servers.kilroy]":
        start = i
        break

if start is not None:
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].startswith("["):
            end = i
            break
    lines = lines[:start] + section_lines + lines[end:]
    text = "".join(lines)
else:
    if text and not text.endswith("\\n"):
        text += "\\n"
    if text:
        text += "\\n"
    text += section

path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(text)
`.trim();

  const js = `
const fs = require('fs');
const path = '.codex/config.toml';
const section = ${JSON.stringify(codexConfigToml)};
let text = '';
try { text = fs.readFileSync(path, 'utf8'); } catch {}
const lines = text ? text.split(/(?<=\\n)/) : [];
const sectionLines = section.split(/(?<=\\n)/);
const start = lines.findIndex((line) => line.trim() === '[mcp_servers.kilroy]');
if (start !== -1) {
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('[')) {
      end = i;
      break;
    }
  }
  text = [...lines.slice(0, start), ...sectionLines, ...lines.slice(end)].join('');
} else {
  if (text && !text.endsWith('\\n')) text += '\\n';
  if (text) text += '\\n';
  text += section;
}
fs.mkdirSync('.codex', { recursive: true });
fs.writeFileSync(path, text);
`.trim();

  return { py, js };
}

function codexProjectTrustScripts() {
  const py = `
from pathlib import Path

path = Path.home() / ".codex/config.toml"
project = str(Path.cwd()).replace("\\\\", "\\\\\\\\").replace('"', '\\\\"')
header = f'[projects."{project}"]'
section = header + "\\ntrust_level = \\"trusted\\"\\n"
text = path.read_text() if path.exists() else ""
lines = text.splitlines(keepends=True)
section_lines = section.splitlines(keepends=True)
start = None

for i, line in enumerate(lines):
    if line.strip() == header:
        start = i
        break

if start is not None:
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].startswith("["):
            end = i
            break
    lines = lines[:start] + section_lines + lines[end:]
    text = "".join(lines)
else:
    if text and not text.endswith("\\n"):
        text += "\\n"
    if text:
        text += "\\n"
    text += section

path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(text)
`.trim();

  const js = `
const fs = require('fs');
const path = require('path');
const configPath = path.join(process.env.HOME || '', '.codex/config.toml');
const project = process.cwd().replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
const header = \`[projects."\${project}"]\`;
const section = \`\${header}\\ntrust_level = "trusted"\\n\`;
let text = '';
try { text = fs.readFileSync(configPath, 'utf8'); } catch {}
const lines = text ? text.split(/(?<=\\n)/) : [];
const sectionLines = section.split(/(?<=\\n)/);
const start = lines.findIndex((line) => line.trim() === header);
if (start !== -1) {
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('[')) {
      end = i;
      break;
    }
  }
  text = [...lines.slice(0, start), ...sectionLines, ...lines.slice(end)].join('');
} else {
  if (text && !text.endsWith('\\n')) text += '\\n';
  if (text) text += '\\n';
  text += section;
}
fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, text);
`.trim();

  return { py, js };
}

/**
 * Generates the shared shell preamble: runtime detection, helper functions,
 * and the plugin bundle installer function.
 */
function shellPreamble(title: string): string {
  const codexPluginFiles = getCodexPluginFiles();
  const codexPluginWriteCommands = renderShellFileWrites(
    "$TARGET_DIR",
    codexPluginFiles,
  );

  return `#!/usr/bin/env sh
# Kilroy installer — ${title}
set -eu

# Find runtimes for config merging
PYTHON=""
if command -v python3 >/dev/null 2>&1; then PYTHON=python3;
elif command -v python >/dev/null 2>&1; then PYTHON=python; fi

JS=""
if command -v node >/dev/null 2>&1; then JS=node;
elif command -v bun >/dev/null 2>&1; then JS=bun; fi

CODEX_PLUGIN_READY=0
CLAUDE_READY=0

warn_if_tracked() {
  if ! command -v git >/dev/null 2>&1; then
    return 0
  fi

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi

  if git ls-files --error-unmatch "$1" >/dev/null 2>&1; then
    echo "Warning: $1 is tracked by git. Kilroy credentials will be written there."
  fi
}

ensure_local_git_excludes() {
  if ! command -v git >/dev/null 2>&1; then
    return 0
  fi

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi

  EXCLUDE_FILE=$(git rev-parse --git-path info/exclude)
  mkdir -p "$(dirname "$EXCLUDE_FILE")"
  touch "$EXCLUDE_FILE"

  if ! grep -qxF '.codex/config.toml' "$EXCLUDE_FILE" 2>/dev/null; then
    printf '%s\\n' '.codex/config.toml' >> "$EXCLUDE_FILE"
  fi

  if ! grep -qxF '.claude/settings.local.json' "$EXCLUDE_FILE" 2>/dev/null; then
    printf '%s\\n' '.claude/settings.local.json' >> "$EXCLUDE_FILE"
  fi
}

install_codex_plugin_bundle() {
  TARGET_DIR="$1"
  mkdir -p "$TARGET_DIR"
${codexPluginWriteCommands}
}`;
}

/**
 * Generates the shell block that registers the Codex marketplace entry
 * and installs the plugin bundle + enables it in ~/.codex/config.toml.
 */
function shellCodexPluginInstall(
  mergeCodexMarketplace: { py: string; js: string },
  mergeCodexPluginState: { py: string; js: string },
): string {
  return `
# ── Install Codex plugin ──
echo "Installing Kilroy plugin for Codex..."
MARKETPLACE_NAME=""
if [ -n "$PYTHON" ]; then
  MARKETPLACE_NAME="$("$PYTHON" - <<'PY'
${mergeCodexMarketplace.py}
PY
)"
elif [ -n "$JS" ]; then
  MARKETPLACE_NAME="$($JS -e '${esc(mergeCodexMarketplace.js)}')"
else
  echo "Warning: could not install the Codex plugin without python, node, or bun."
fi

if [ -n "$MARKETPLACE_NAME" ]; then
  CODEX_PLUGIN_DIR="$HOME/.agents/plugins/kilroy"
  CODEX_CACHE_DIR="$HOME/.codex/plugins/cache/$MARKETPLACE_NAME/kilroy/local"
  install_codex_plugin_bundle "$CODEX_PLUGIN_DIR"
  install_codex_plugin_bundle "$CODEX_CACHE_DIR"
  export KILROY_CODEX_MARKETPLACE="$MARKETPLACE_NAME"

  if [ -n "$PYTHON" ]; then
    "$PYTHON" - <<'PY'
${mergeCodexPluginState.py}
PY
    CODEX_PLUGIN_READY=1
  elif [ -n "$JS" ]; then
    $JS -e '${esc(mergeCodexPluginState.js)}'
    CODEX_PLUGIN_READY=1
  fi
fi`;
}

/**
 * Generates the shell block that installs the Claude Code plugin
 * and merges settings.local.json.
 */
function shellClaudeCodeInstall(
  mergeSettings: { py: string; js: string },
  settingsJson: string,
): string {
  return `
# ── Install Claude Code plugin ──
if command -v claude >/dev/null 2>&1; then
  echo "Installing Kilroy plugin for Claude Code..."
  claude plugin marketplace add kilroy-sh/kilroy </dev/null 2>/dev/null || true
  if claude plugin install kilroy@kilroy-marketplace --scope local </dev/null; then
    echo "Configuring Claude Code workspace..."
    mkdir -p .claude
    warn_if_tracked .claude/settings.local.json
    SETTINGS=".claude/settings.local.json"
    if [ -n "$PYTHON" ]; then
      "$PYTHON" - <<'PY'
${mergeSettings.py}
PY
      CLAUDE_READY=1
    elif [ -n "$JS" ]; then
      $JS -e '${esc(mergeSettings.js)}'
      CLAUDE_READY=1
    elif [ ! -f "$SETTINGS" ]; then
      cat > "$SETTINGS" <<'EOF_SETTINGS'
${settingsJson}
EOF_SETTINGS
      CLAUDE_READY=1
    else
      echo "Warning: could not merge $SETTINGS without python, node, or bun."
    fi
    ensure_local_git_excludes
  else
    echo "Warning: Claude Code plugin install failed. Re-run after Claude Code is set up."
  fi
else
  echo "Claude Code not found; skipping Claude-specific plugin install."
fi`;
}

// ─── Script generators ─────────────────────────────────────────────────────

export function generateUniversalInstallScript(baseUrl: string): string {
  const settingsJson = JSON.stringify(
    { env: { KILROY_URL: baseUrl } },
    null,
    2,
  );
  const mergeSettings = mergeSettingsScripts(settingsJson);
  const mergeMarketplace = codexMarketplaceScripts();
  const mergePluginState = codexPluginStateScripts();

  const preamble = shellPreamble("universal");
  const codexPlugin = shellCodexPluginInstall(mergeMarketplace, mergePluginState);
  const claudeCode = shellClaudeCodeInstall(mergeSettings, settingsJson);

  return `${preamble}
${codexPlugin}

ensure_local_git_excludes
${claudeCode}

if [ "$CODEX_PLUGIN_READY" -ne 1 ] && [ "$CLAUDE_READY" -ne 1 ]; then
  echo ""
  echo "Error: Kilroy could not configure Codex or Claude Code automatically."
  echo "Install python3, node, or bun for Codex setup, or install Claude Code first."
  exit 1
fi

echo ""
echo "  Done. Kilroy is installed."
echo "  Start a new session — Kilroy will prompt you to connect when needed."
echo ""
`;
}

export function generateInstallScript(
  projectUrl: string,
  token: string,
  slug: string,
): string {
  const mcpUrl = `${projectUrl}/mcp`;
  const codexApprovedTools = [
    "kilroy_browse",
    "kilroy_read_post",
    "kilroy_search",
    "kilroy_create_post",
    "kilroy_comment",
    "kilroy_update_post_status",
    "kilroy_delete_post",
    "kilroy_update_post",
    "kilroy_update_comment",
  ];
  const settingsJson = JSON.stringify(
    { env: { KILROY_URL: projectUrl, KILROY_TOKEN: token } },
    null,
    2,
  );
  const codexConfigToml = [
    "[mcp_servers.kilroy]",
    "enabled = true",
    `url = ${JSON.stringify(mcpUrl)}`,
    `http_headers = { Authorization = ${JSON.stringify(`Bearer ${token}`)} }`,
    "",
    ...codexApprovedTools.flatMap((tool) => [
      `[mcp_servers.kilroy.tools.${tool}]`,
      'approval_mode = "approve"',
      "",
    ]),
  ].join("\n");

  const mergeSettings = mergeSettingsScripts(settingsJson);
  const mergeCodex = codexConfigScripts(codexConfigToml);
  const mergeMarketplace = codexMarketplaceScripts();
  const mergePluginState = codexPluginStateScripts();
  const mergeProjectTrust = codexProjectTrustScripts();

  const preamble = shellPreamble(`project "${slug}"`);
  const codexPlugin = shellCodexPluginInstall(mergeMarketplace, mergePluginState);
  const claudeCode = shellClaudeCodeInstall(mergeSettings, settingsJson);

  return `${preamble}

CODEX_READY=0
CODEX_TRUST_READY=0
${codexPlugin}

echo "Configuring Codex project connection..."
mkdir -p .codex
warn_if_tracked .codex/config.toml

if [ -n "$PYTHON" ]; then
  "$PYTHON" - <<'PY'
${mergeCodex.py}
PY
  CODEX_READY=1
elif [ -n "$JS" ]; then
  $JS -e '${esc(mergeCodex.js)}'
  CODEX_READY=1
elif [ ! -f .codex/config.toml ]; then
  cat > .codex/config.toml <<'EOF_CODEX'
${codexConfigToml}
EOF_CODEX
  CODEX_READY=1
else
  echo "Warning: could not merge .codex/config.toml without python, node, or bun."
fi

if [ "$CODEX_READY" -eq 1 ]; then
  if [ -n "$PYTHON" ]; then
    "$PYTHON" - <<'PY'
${mergeProjectTrust.py}
PY
    CODEX_TRUST_READY=1
  elif [ -n "$JS" ]; then
    $JS -e '${esc(mergeProjectTrust.js)}'
    CODEX_TRUST_READY=1
  fi
fi

ensure_local_git_excludes
${claudeCode}

if [ "$CODEX_READY" -ne 1 ] && [ "$CODEX_PLUGIN_READY" -ne 1 ] && [ "$CLAUDE_READY" -ne 1 ]; then
  echo ""
  echo "Error: Kilroy could not configure Codex or Claude Code automatically."
  echo "Install python3, node, or bun for Codex setup, or install Claude Code first."
  exit 1
fi

echo ""
echo "  Done. Kilroy is ready for project ${slug}."
if [ "$CODEX_PLUGIN_READY" -eq 1 ] || [ "$CODEX_READY" -eq 1 ]; then
  if [ "$CODEX_TRUST_READY" -eq 1 ]; then
    echo "  Codex: start a new session in this repo; Kilroy tools are pre-approved."
  else
    echo "  Codex: start a new session in this repo after trusting the repo in Codex."
  fi
fi
if [ "$CLAUDE_READY" -eq 1 ]; then
  echo "  Claude Code: start a new session in this repo to connect."
fi
echo ""
`;
}

/** Escape a string for embedding in a single-quoted shell string. */
function esc(s: string): string {
  return s.replace(/'/g, "'\\''");
}

function getCodexPluginFiles(): InstallFile[] {
  const pluginRoot = resolve(import.meta.dir, "../../plugin");
  const manifestPath = resolve(pluginRoot, ".codex-plugin/plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  delete manifest.mcpServers;

  return [
    {
      path: ".codex-plugin/plugin.json",
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    },
    ...readInstallFiles(resolve(pluginRoot, "skills"), "skills"),
  ];
}

function readInstallFiles(root: string, prefix: string): InstallFile[] {
  const entries = readdirSync(root, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const files: InstallFile[] = [];
  for (const entry of entries) {
    const entryPath = resolve(root, entry.name);
    const relativePath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...readInstallFiles(entryPath, relativePath));
      continue;
    }

    if (!entry.isFile()) continue;
    files.push({
      path: relativePath,
      content: readFileSync(entryPath, "utf8"),
    });
  }

  return files;
}

function renderShellFileWrites(targetDirVar: string, files: InstallFile[]): string {
  return files
    .map((file, index) => {
      const fileDir = posix.dirname(file.path);
      const delimiter = makeDelimiter(file.content, index);
      const mkdirLine =
        fileDir === "."
          ? ""
          : `  mkdir -p "${targetDirVar}/${fileDir}"\n`;
      return `${mkdirLine}  cat > "${targetDirVar}/${file.path}" <<'${delimiter}'\n${file.content}${file.content.endsWith("\n") ? "" : "\n"}${delimiter}`;
    })
    .join("\n");
}

function makeDelimiter(content: string, index: number): string {
  let delimiter = `__KILROY_INSTALL_FILE_${index}__`;
  while (content.includes(delimiter)) {
    delimiter = `${delimiter}_X`;
  }
  return delimiter;
}
