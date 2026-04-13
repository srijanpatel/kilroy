import { Hono } from "hono";
import { readFileSync, readdirSync } from "fs";
import { posix, resolve } from "path";
import { getBaseUrl } from "../lib/url";

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
 * GET /:account/:project/install — serves a shell script that sets up Kilroy
 * for a project in one shot. No key required — OAuth handles auth at runtime.
 *
 *   curl -sL https://kilroy.sh/acme/my-project/install | sh
 *
 * The script:
 *  1. Installs and enables a home-local Codex plugin bundle for Kilroy skills
 *  2. Writes `.kilroy/config.toml` with the project mapping
 *  3. Installs the Kilroy plugin in Claude Code when `claude` is available
 *  4. Configures KILROY_URL in `.claude/settings.local.json`
 */
export const installHandler = new Hono();

type InstallFile = {
  path: string;
  content: string;
};

installHandler.get("/", (c) => {
  const url = new URL(c.req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const accountSlug = segments[0];
  const projectSlug = segments[1];
  const baseUrl = getBaseUrl(c.req.url);
  const projectUrl = `${baseUrl}/${accountSlug}/${projectSlug}`;

  const script = generateInstallScript(projectUrl, projectSlug, accountSlug);

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
    policy: { installation: "AVAILABLE", authentication: "ON_FIRST_USE" },
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

function opencodeConfigScripts(baseUrl: string) {
  const pluginRef = "kilroy@git+https://github.com/kilroy-sh/kilroy-opencode.git";
  const mcpUrl = `${baseUrl}/mcp`;

  const py = `
import json
from pathlib import Path

path = Path.home() / ".config/opencode/opencode.json"
plugin_ref = ${JSON.stringify(pluginRef)}
mcp_entry = {
    "type": "remote",
    "url": ${JSON.stringify(mcpUrl)},
    "enabled": True,
    "oauth": {},
}

config = {}
try:
    config = json.loads(path.read_text())
except Exception:
    config = {}
if not isinstance(config, dict):
    config = {}

plugins = config.get("plugin")
if not isinstance(plugins, list):
    plugins = []
if plugin_ref not in plugins:
    plugins.append(plugin_ref)
config["plugin"] = plugins

mcp = config.get("mcp")
if not isinstance(mcp, dict):
    mcp = {}
mcp["kilroy"] = mcp_entry
config["mcp"] = mcp

path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(config, indent=2) + "\\n")
`.trim();

  const js = `
const fs = require('fs');
const path = require('path');
const configPath = path.join(process.env.HOME || '', '.config/opencode/opencode.json');
const pluginRef = ${JSON.stringify(pluginRef)};
const mcpEntry = {
  type: 'remote',
  url: ${JSON.stringify(mcpUrl)},
  enabled: true,
  oauth: {},
};

let config = {};
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
if (!config || typeof config !== 'object' || Array.isArray(config)) config = {};

const plugins = Array.isArray(config.plugin) ? config.plugin : [];
if (!plugins.includes(pluginRef)) plugins.push(pluginRef);
config.plugin = plugins;

const mcp = config.mcp && typeof config.mcp === 'object' && !Array.isArray(config.mcp) ? config.mcp : {};
mcp.kilroy = mcpEntry;
config.mcp = mcp;

fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\\n');
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

# ── Output helpers ─────────────────────────────────────────
if [ -t 1 ]; then
  K_O=$(printf '\\033[38;5;208m')
  K_D=$(printf '\\033[2m')
  K_B=$(printf '\\033[1m')
  K_R=$(printf '\\033[0m')
else
  K_O=""; K_D=""; K_B=""; K_R=""
fi

k_logo() {
  printf '\\n'
  printf '        %s╻%s\\n'           "$K_O" "$K_R"
  printf '    %s╭───┸───╮%s\\n'       "$K_O" "$K_R"
  printf '    %s│ ◉   ◉ │%s\\n'       "$K_O" "$K_R"
  printf '%s────┤   ┃   ├────%s  %skilroy%s  %s·  an agent was here%s\\n' \\
    "$K_O" "$K_R" "$K_B" "$K_R" "$K_D" "$K_R"
  printf '        %s┃%s\\n'           "$K_O" "$K_R"
  printf '\\n'
}

k_say()   { printf '  %s\\n' "$1"; }
k_blank() { printf '\\n'; }
k_ok()    { printf '    %s✓%s %s\\n' "$K_O" "$K_R" "$1"; }
k_warn()  { printf '    %s!%s %s\\n' "$K_O" "$K_R" "$1"; }
k_err()   { printf '    %s✗%s %s\\n' "$K_O" "$K_R" "$1"; }

# Find runtimes for config merging
PYTHON=""
if command -v python3 >/dev/null 2>&1; then PYTHON=python3;
elif command -v python >/dev/null 2>&1; then PYTHON=python; fi

JS=""
if command -v node >/dev/null 2>&1; then JS=node;
elif command -v bun >/dev/null 2>&1; then JS=bun; fi

CODEX_PLUGIN_READY=0
CLAUDE_READY=0
OPENCODE_READY=0
CODEX_AUTH_DONE=0

warn_if_tracked() {
  if ! command -v git >/dev/null 2>&1; then
    return 0
  fi

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi

  if git ls-files --error-unmatch "$1" >/dev/null 2>&1; then
    k_warn "$1 is tracked by git — Kilroy credentials will be written there"
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
MARKETPLACE_NAME=""
if [ -n "$PYTHON" ]; then
  MARKETPLACE_NAME="$("$PYTHON" - <<'PY'
${mergeCodexMarketplace.py}
PY
)"
elif [ -n "$JS" ]; then
  MARKETPLACE_NAME="$($JS -e '${esc(mergeCodexMarketplace.js)}')"
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
fi

if [ "$CODEX_PLUGIN_READY" -eq 1 ]; then
  k_ok "Codex plugin installed"
elif [ -z "$PYTHON" ] && [ -z "$JS" ]; then
  k_warn "Skipped Codex plugin (needs python3, node, or bun)"
else
  k_err "Codex plugin install failed"
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
  CC_LOG=$(mktemp 2>/dev/null || echo "/tmp/kilroy-cc-$$.log")
  claude plugin marketplace add kilroy-sh/kilroy </dev/null >"$CC_LOG" 2>&1 || true
  if claude plugin install kilroy@kilroy-marketplace --scope user </dev/null >>"$CC_LOG" 2>&1; then
    k_ok "Claude Code plugin installed"
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
    fi
    if [ "$CLAUDE_READY" -eq 1 ]; then
      k_ok "Claude Code workspace configured"
      ensure_local_git_excludes
    else
      k_warn "Could not merge $SETTINGS (needs python3, node, or bun)"
    fi
  else
    k_err "Claude Code plugin install failed"
    sed 's/^/      /' "$CC_LOG"
  fi
  rm -f "$CC_LOG"
fi`;
}

/**
 * Generates the shell block that adds Kilroy entries to opencode.json.
 * Guards on `command -v opencode` so it's a no-op on machines without OpenCode.
 */
function shellOpenCodeInstall(
  mergeOpenCode: { py: string; js: string },
): string {
  return `
# ── Install OpenCode plugin ──
if command -v opencode >/dev/null 2>&1; then
  if [ -n "$PYTHON" ]; then
    "$PYTHON" - <<'PY'
${mergeOpenCode.py}
PY
    OPENCODE_READY=1
  elif [ -n "$JS" ]; then
    $JS -e '${esc(mergeOpenCode.js)}'
    OPENCODE_READY=1
  fi

  if [ "$OPENCODE_READY" -eq 1 ]; then
    k_ok "OpenCode configured — plugin will load on next launch"
  else
    k_warn "Skipped OpenCode config merge (needs python3, node, or bun)"
  fi
fi`;
}

/**
 * Generates the shell block that kicks off `opencode mcp auth kilroy`
 * interactively if a TTY is available. Mirrors the Codex OAuth kickoff.
 */
function shellOpenCodeAuthKickoff(): string {
  return `
# ── OpenCode OAuth (interactive, one-time) ──
if [ "$OPENCODE_READY" -eq 1 ] && command -v opencode >/dev/null 2>&1; then
  k_blank
  if [ -e /dev/tty ] && [ -r /dev/tty ]; then
    k_say "Signing OpenCode into Kilroy (a browser window will open)..."
    k_blank
    if opencode mcp auth kilroy </dev/tty >/dev/tty 2>/dev/tty; then
      k_blank
      k_ok "OpenCode authenticated"
    else
      k_blank
      k_warn "OpenCode sign-in didn't complete — run: opencode mcp auth kilroy"
    fi
  else
    k_warn "OpenCode needs a one-time sign-in — run: opencode mcp auth kilroy"
  fi
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
  const mergeOpenCode = opencodeConfigScripts(baseUrl);

  const preamble = shellPreamble("universal");
  const codexPlugin = shellCodexPluginInstall(mergeMarketplace, mergePluginState);
  const claudeCode = shellClaudeCodeInstall(mergeSettings, settingsJson);
  const opencode = shellOpenCodeInstall(mergeOpenCode);
  const opencodeAuth = shellOpenCodeAuthKickoff();

  return `${preamble}

k_logo
k_say "Setting up Kilroy..."
k_blank
${codexPlugin}

ensure_local_git_excludes
${claudeCode}
${opencode}

if [ "$CODEX_PLUGIN_READY" -ne 1 ] && [ "$CLAUDE_READY" -ne 1 ] && [ "$OPENCODE_READY" -ne 1 ]; then
  k_blank
  k_err "Could not configure Codex, Claude Code, or OpenCode."
  k_say "Install python3, node, or bun for config merging, and install at least one of codex/claude/opencode."
  k_blank
  exit 1
fi

# ── Codex OAuth (interactive, one-time) ──
if [ "$CODEX_PLUGIN_READY" -eq 1 ] && command -v codex >/dev/null 2>&1; then
  k_blank
  if [ -e /dev/tty ] && [ -r /dev/tty ]; then
    k_say "Signing Codex into Kilroy (a browser window will open)..."
    k_blank
    if codex mcp login kilroy </dev/tty >/dev/tty 2>/dev/tty; then
      k_blank
      k_ok "Codex authenticated"
      CODEX_AUTH_DONE=1
    else
      k_blank
      k_warn "Codex sign-in didn't complete — run: codex mcp login kilroy"
    fi
  else
    k_warn "Codex needs a one-time sign-in — run: codex mcp login kilroy"
  fi
fi
${opencodeAuth}

k_blank
printf '  %sDone.%s Start a new session to use Kilroy.\\n' "$K_B" "$K_R"
k_blank
`;
}

export function generateInstallScript(
  projectUrl: string,
  slug: string,
  accountSlug: string,
): string {
  const settingsJson = JSON.stringify(
    { env: { KILROY_URL: projectUrl } },
    null,
    2,
  );

  const mergeSettings = mergeSettingsScripts(settingsJson);
  const mergeMarketplace = codexMarketplaceScripts();
  const mergePluginState = codexPluginStateScripts();
  const mergeProjectTrust = codexProjectTrustScripts();
  // OpenCode's MCP entry must target the ROOT /mcp endpoint (JWT OAuth via
  // server.ts:187), NOT the project-scoped /{account}/{project}/mcp endpoint
  // (which uses projectAuth/member-key middleware and rejects OAuth JWTs).
  // Project routing happens via .kilroy/config.toml + the `project` parameter
  // on each tool call, not via the endpoint URL.
  const mergeOpenCode = opencodeConfigScripts(new URL(projectUrl).origin);

  const preamble = shellPreamble(`project "${slug}"`);
  const codexPlugin = shellCodexPluginInstall(mergeMarketplace, mergePluginState);
  const claudeCode = shellClaudeCodeInstall(mergeSettings, settingsJson);
  const opencode = shellOpenCodeInstall(mergeOpenCode);
  const opencodeAuth = shellOpenCodeAuthKickoff();

  return `${preamble}

k_logo
k_say "Setting up Kilroy for ${accountSlug}/${slug}..."
k_blank

CODEX_TRUST_READY=0
${codexPlugin}

if [ "$CODEX_PLUGIN_READY" -eq 1 ]; then
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

# Write project mapping
mkdir -p .kilroy
cat > .kilroy/config.toml <<'EOF_KILROY'
project = "${accountSlug}/${slug}"
EOF_KILROY

ensure_local_git_excludes
${claudeCode}
${opencode}

if [ "$CODEX_PLUGIN_READY" -ne 1 ] && [ "$CLAUDE_READY" -ne 1 ] && [ "$OPENCODE_READY" -ne 1 ]; then
  k_blank
  k_err "Could not configure Codex, Claude Code, or OpenCode."
  k_say "Install python3, node, or bun for config merging, and install at least one of codex/claude/opencode."
  k_blank
  exit 1
fi

if [ "$CODEX_PLUGIN_READY" -eq 1 ] && [ "$CODEX_TRUST_READY" -ne 1 ]; then
  k_warn "Codex repo trust not set — trust this repo in Codex before starting a session"
fi

# ── Codex OAuth (interactive, one-time) ──
if [ "$CODEX_PLUGIN_READY" -eq 1 ] && command -v codex >/dev/null 2>&1; then
  k_blank
  if [ -e /dev/tty ] && [ -r /dev/tty ]; then
    k_say "Signing Codex into Kilroy (a browser window will open)..."
    k_blank
    if codex mcp login kilroy </dev/tty >/dev/tty 2>/dev/tty; then
      k_blank
      k_ok "Codex authenticated"
      CODEX_AUTH_DONE=1
    else
      k_blank
      k_warn "Codex sign-in didn't complete — run: codex mcp login kilroy"
    fi
  else
    k_warn "Codex needs a one-time sign-in — run: codex mcp login kilroy"
  fi
fi
${opencodeAuth}

k_blank
printf '  %sDone.%s Kilroy is ready for ${accountSlug}/${slug}. Start a new session.\\n' "$K_B" "$K_R"
k_blank
`;
}

/** Escape a string for embedding in a single-quoted shell string. */
function esc(s: string): string {
  return s.replace(/'/g, "'\\''");
}

function getCodexPluginFiles(): InstallFile[] {
  const pluginRoot = resolve(import.meta.dir, "../../plugin");
  const manifestPath = resolve(pluginRoot, ".codex-plugin/plugin.json");

  return [
    {
      path: ".codex-plugin/plugin.json",
      content: readFileSync(manifestPath, "utf8"),
    },
    {
      path: ".mcp.json",
      content: readFileSync(resolve(pluginRoot, ".mcp.json"), "utf8"),
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
