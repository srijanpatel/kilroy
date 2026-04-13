/**
 * Kilroy plugin for OpenCode.ai
 *
 * Registers the using-kilroy skill directory with OpenCode and injects a
 * bootstrap message into every new session so the agent knows to check
 * Kilroy before starting work. Modeled on obra/superpowers v5.0.7.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, 'skills');
const skillPath = path.join(skillsDir, 'using-kilroy', 'SKILL.md');

const stripFrontmatter = (content) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  return match ? match[2] : content;
};

const readProjectMapping = (directory) => {
  try {
    const configPath = path.join(directory, '.kilroy/config.toml');
    const text = fs.readFileSync(configPath, 'utf8');
    const match = text.match(/^\s*project\s*=\s*["']([^"']+)["']/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

let warnedMissingSkill = false;
const buildBootstrap = (directory) => {
  if (!fs.existsSync(skillPath)) {
    if (!warnedMissingSkill) {
      console.warn('[kilroy] SKILL.md not found at', skillPath);
      warnedMissingSkill = true;
    }
    return null;
  }
  const content = stripFrontmatter(fs.readFileSync(skillPath, 'utf8'));
  const project = readProjectMapping(directory);

  const projectHint = project
    ? `**Project routing:** This directory is mapped to \`${project}\`. Pass \`project: "${project}"\` on every Kilroy MCP tool call.`
    : `**Project routing:** No \`.kilroy/config.toml\` found in the current directory. Call \`kilroy_list_projects\` and ask the user which project to use, then save the mapping to \`.kilroy/config.toml\`.`;

  const toolMapping = `**Tool access:** Kilroy tools are exposed via the MCP server named \`kilroy\` in \`opencode.json\`. All tool calls require a \`project\` parameter — see project routing above.`;

  return `<KILROY>
You have access to Kilroy — a tribal knowledge system for coding agents. The \`using-kilroy\` skill content is loaded below. Do NOT re-load it via the skill tool.

${content}

${projectHint}

${toolMapping}
</KILROY>`;
};

export const KilroyPlugin = async ({ directory }) => ({
  // Push the bundled skills directory into OpenCode's skills path so the
  // native `skill` tool can discover `using-kilroy`.
  config: async (config) => {
    config.skills = config.skills || {};
    config.skills.paths = config.skills.paths || [];
    if (!config.skills.paths.includes(skillsDir)) {
      config.skills.paths.push(skillsDir);
    }
  },

  // Inject the bootstrap as a text part on the first user message of each
  // session. Using a user message (not a system message) avoids:
  //   1. Token bloat from system messages repeated every turn
  //   2. Models like Qwen breaking on multiple system messages
  // Idempotency guard prevents double-injection if the hook fires twice.
  'experimental.chat.messages.transform': async (_input, output) => {
    const bootstrap = buildBootstrap(directory);
    if (!bootstrap || !output.messages.length) return;
    const firstUser = output.messages.find((m) => m.info.role === 'user');
    if (!firstUser || !firstUser.parts.length) return;
    if (firstUser.parts.some((p) => p.type === 'text' && p.text.includes('<KILROY>'))) return;
    const ref = firstUser.parts[0];
    firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
  },
});
