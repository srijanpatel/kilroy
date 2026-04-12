import { describe, expect, it } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { generateInstallScript } from "../src/routes/install";

describe("generateInstallScript", () => {
  it("includes Codex plugin, project mapping, and Claude setup paths", () => {
    const script = generateInstallScript(
      "https://kilroy.sh/srijan/sagaland",
      "sagaland",
      "srijan",
    );

    expect(script).toContain("#!/usr/bin/env sh");
    // Codex plugin install (marketplace + bundle)
    expect(script).toContain('.agents/plugins/marketplace.json');
    expect(script).toContain('[plugins."kilroy@');
    expect(script).toContain('[projects."');
    expect(script).toContain('trust_level = "trusted"');
    // Project mapping via .kilroy/config.toml
    expect(script).toContain('.kilroy/config.toml');
    expect(script).toContain('project = "srijan/sagaland"');
    // No MCP server config or tokens in .codex/config.toml
    expect(script).not.toContain("[mcp_servers.kilroy]");
    expect(script).not.toContain("KILROY_TOKEN");
    // Claude Code plugin install
    expect(script).toContain(".claude/settings.local.json");
    expect(script).toContain("claude plugin install");
    expect(script).toContain("Claude Code not found; skipping Claude-specific plugin install.");
  });

  it("bootstraps Codex plugin and project mapping when executed in a repo", () => {
    const root = mkdtempSync(join(tmpdir(), "kilroy-install-"));
    const homeDir = join(root, "home");
    const projectDir = join(root, "project");
    const binDir = join(root, "bin");
    const scriptPath = join(root, "install.sh");

    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });

    const bunPath = Bun.which("bun");
    expect(bunPath).toBeTruthy();
    const bunShim = join(binDir, "bun");
    writeFileSync(bunShim, `#!/usr/bin/env sh\nexec "${bunPath}" "$@"\n`);
    chmodSync(bunShim, 0o755);

    const script = generateInstallScript(
      "https://kilroy.sh/srijan/sagaland",
      "sagaland",
      "srijan",
    );
    writeFileSync(scriptPath, script);
    chmodSync(scriptPath, 0o755);

    const result = Bun.spawnSync({
      cmd: ["/bin/sh", scriptPath],
      cwd: projectDir,
      env: {
        ...process.env,
        HOME: homeDir,
        PATH: `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = Buffer.from(result.stdout).toString("utf8");
    const stderr = Buffer.from(result.stderr).toString("utf8");

    expect(result.exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Installing Kilroy plugin for Codex...");
    expect(stdout).toContain("Codex: start a new session in this repo");

    // Project mapping written to .kilroy/config.toml
    const kilroyConfig = readFileSync(
      join(projectDir, ".kilroy/config.toml"),
      "utf8",
    );
    expect(kilroyConfig).toContain('project = "srijan/sagaland"');

    // No project-level .codex/config.toml (Codex uses plugin OAuth)
    expect(existsSync(join(projectDir, ".codex/config.toml"))).toBe(false);

    const marketplace = JSON.parse(
      readFileSync(join(homeDir, ".agents/plugins/marketplace.json"), "utf8"),
    );
    expect(marketplace.plugins.some((plugin: any) => plugin.name === "kilroy")).toBe(
      true,
    );

    const homePluginManifestPath = join(
      homeDir,
      ".agents/plugins/kilroy/.codex-plugin/plugin.json",
    );
    expect(existsSync(homePluginManifestPath)).toBe(true);
    const homePluginManifest = JSON.parse(
      readFileSync(homePluginManifestPath, "utf8"),
    );
    expect(homePluginManifest.skills).toBe("./skills/");
    expect(homePluginManifest.mcpServers).toBeUndefined();

    const cachePluginManifestPath = join(
      homeDir,
      `.codex/plugins/cache/${marketplace.name}/kilroy/local/.codex-plugin/plugin.json`,
    );
    expect(existsSync(cachePluginManifestPath)).toBe(true);

    const homeCodexConfig = readFileSync(
      join(homeDir, ".codex/config.toml"),
      "utf8",
    );
    expect(homeCodexConfig).toContain(`[plugins."kilroy@${marketplace.name}"]`);
    expect(homeCodexConfig).toContain("enabled = true");
    expect(homeCodexConfig).toContain(`[projects."${realpathSync(projectDir)}"]`);
    expect(homeCodexConfig).toContain('trust_level = "trusted"');
  });
});
