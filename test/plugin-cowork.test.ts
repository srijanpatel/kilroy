import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

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

describe("plugin-cowork hooks", () => {
  const HOOKS = resolve(PLUGIN, "hooks");

  test("hooks.json is valid and matcher targets only tools accepting author_metadata", () => {
    const hooks = readJson("hooks/hooks.json");
    const matcher: string = hooks.hooks.PreToolUse[0].matcher;
    const re = new RegExp(`^(${matcher})$`);
    // Prefix is the documented guess for plugin "kilroy-cowork" + server "kilroy";
    // verified only by the live Cowork test (spec: Testing #5).
    expect(re.test("mcp__plugin_kilroy-cowork_kilroy__kilroy_create_post")).toBe(true);
    expect(re.test("mcp__plugin_kilroy-cowork_kilroy__kilroy_comment")).toBe(true);
    // update/edit tools do NOT accept author_metadata — must not match
    expect(re.test("mcp__plugin_kilroy-cowork_kilroy__kilroy_update_post")).toBe(false);
    expect(re.test("mcp__plugin_kilroy-cowork_kilroy__kilroy_update_comment")).toBe(false);
    expect(hooks.hooks.SessionStart[0].matcher).toBe("startup|resume|clear|compact");
  });

  test("inject-context.sh stamps cowork author_metadata", () => {
    const payload = JSON.stringify({
      session_id: "sess-1",
      tool_name: "mcp__plugin_kilroy-cowork_kilroy__kilroy_create_post",
      tool_input: { project: "a/b", title: "t", body: "b", tags: ["decision"] },
    });
    const run = spawnSync("bash", [resolve(HOOKS, "scripts/inject-context.sh")], {
      input: payload,
    });
    expect(run.status).toBe(0);
    const out = JSON.parse(run.stdout.toString());
    const updated = out.hookSpecificOutput.updatedInput;
    expect(updated.project).toBe("a/b");
    expect(updated.author_metadata.agent).toBe("cowork");
    expect(updated.author_metadata.session_id).toBe("sess-1");
    expect(updated.author_metadata.git_user).toBeUndefined();
  });

  test("inject-context.sh is a silent no-op without jq", () => {
    const run = spawnSync("/bin/bash", [resolve(HOOKS, "scripts/inject-context.sh")], {
      input: "{}",
      env: { ...process.env, PATH: "/nonexistent" },
    });
    expect(run.status).toBe(0);
    expect(run.stdout.toString().trim()).toBe("");
  });

  test("session-start.sh emits valid SessionStart JSON and exits 0", () => {
    const run = spawnSync("bash", [resolve(HOOKS, "scripts/session-start.sh")]);
    expect(run.status).toBe(0);
    const out = JSON.parse(run.stdout.toString());
    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext.length).toBeGreaterThan(10);
  });
});
