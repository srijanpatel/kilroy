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
    expect(script).toContain("if command -v claude >/dev/null 2>&1");
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
    expect(stdout).toContain("Setting up Kilroy for srijan/sagaland");
    expect(stdout).toContain("Codex plugin installed");
    expect(stdout).toContain("Kilroy is ready for srijan/sagaland");

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
    expect(homePluginManifest.mcpServers).toBe("./.mcp.json");

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

  it("includes OpenCode plugin and MCP entries", () => {
    const script = generateInstallScript(
      "https://kilroy.sh/srijan/sagaland",
      "sagaland",
      "srijan",
    );

    // Guards on the `opencode` binary being present
    expect(script).toContain("command -v opencode");
    // Writes to the OpenCode config path
    expect(script).toContain(".config/opencode/opencode.json");
    // Registers the thin repo as a plugin entry
    expect(script).toContain(
      "kilroy@git+https://github.com/kilroy-sh/kilroy-opencode.git",
    );
    // Registers Kilroy MCP as a remote server with OAuth, pointed at the ROOT
    // /mcp endpoint (not the project-scoped one — OAuth JWTs don't pass the
    // projectAuth middleware). Project routing happens via .kilroy/config.toml.
    expect(script).toContain('"type": "remote"');
    expect(script).toContain('"url": "https://kilroy.sh/mcp"');
    expect(script).not.toContain('"url": "https://kilroy.sh/srijan/sagaland/mcp"');
    // Python embedded script uses literal True; JS variant uses lowercase true
    expect(script).toContain('"enabled": True');
    expect(script).toContain("enabled: true");
    expect(script).toContain('"oauth": {}');
    // OpenCode readiness flag exists in preamble
    expect(script).toContain("OPENCODE_READY=0");
    // OAuth kickoff command
    expect(script).toContain("opencode mcp auth kilroy");
  });
});
