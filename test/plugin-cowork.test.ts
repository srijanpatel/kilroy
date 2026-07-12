import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");
const PLUGIN = resolve(ROOT, "plugin-cowork");

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(PLUGIN, path), "utf8"));
}

describe("plugin-cowork manifest", () => {
  test("plugin.json has the right name and version shape", () => {
    const manifest = readJson(".claude-plugin/plugin.json");
    expect(manifest.name).toBe("kilroy-cowork");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description).toContain("Cowork");
  });

  test(".mcp.json targets hosted kilroy.sh with a literal URL", () => {
    const mcp = readJson(".mcp.json");
    expect(mcp.mcpServers.kilroy.type).toBe("http");
    // Literal URL — Cowork cannot expand ${KILROY_URL:-...} (spec decision 1)
    expect(mcp.mcpServers.kilroy.url).toBe("https://kilroy.sh/mcp");
  });

  test("command file exists with kilroy frontmatter", () => {
    const cmd = readFileSync(resolve(PLUGIN, "commands/kilroy.md"), "utf8");
    expect(cmd).toContain("name: kilroy");
    expect(cmd).toContain("$ARGUMENTS");
  });
});
