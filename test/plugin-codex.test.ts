import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const pluginRoot = join(import.meta.dir, "../plugin");

function readJson(rel: string) {
  return JSON.parse(readFileSync(join(pluginRoot, rel), "utf8"));
}

// ChatGPT and Codex marketplace installs read the .codex-plugin manifest and
// cannot expand Claude Code's `${KILROY_URL:-...}` env template — same
// constraint as Cowork (see plugin-cowork.test.ts). The Codex manifest must
// therefore point at its own literal-URL MCP config, while the root
// .mcp.json keeps the template for Claude Code's self-host override.
describe("kilroy plugin (codex/agents format)", () => {
  test("manifest points at a codex-specific MCP config", () => {
    const manifest = readJson(".codex-plugin/plugin.json");
    expect(manifest.mcpServers).toBe("./.codex-plugin/mcp.json");
  });

  test("codex MCP config targets hosted kilroy.sh with a literal URL", () => {
    const mcp = readJson(".codex-plugin/mcp.json");
    expect(mcp.mcpServers.kilroy.url).toBe("https://kilroy.sh/mcp");
    expect(mcp.mcpServers.kilroy.type).toBe("http");
  });

  test("root .mcp.json keeps the env template for Claude Code", () => {
    const mcp = readJson(".mcp.json");
    expect(mcp.mcpServers.kilroy.url).toBe(
      "${KILROY_URL:-https://kilroy.sh}/mcp",
    );
  });
});
