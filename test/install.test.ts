import { describe, expect, it } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { realpathSync } from "fs";
import {
  generateProjectInstallScript,
  generateUniversalInstallScript,
} from "../src/routes/install";

describe("generateUniversalInstallScript", () => {
  it("includes Codex plugin and Claude setup paths, scoped to the serving domain", () => {
    const script = generateUniversalInstallScript("https://kilroy.example.com");

    expect(script).toContain("#!/usr/bin/env sh");
    // Codex plugin install (marketplace + bundle)
    expect(script).toContain(".agents/plugins/marketplace.json");
    expect(script).toContain('[plugins."kilroy@');
    // Domain-scoped: doesn't write a project mapping or repo trust
    expect(script).not.toContain("cat > .kilroy/config.toml");
    expect(script).not.toContain('trust_level = "trusted"');
    // No MCP server config or tokens in .codex/config.toml
    expect(script).not.toContain("[mcp_servers.kilroy]");
    expect(script).not.toContain("KILROY_TOKEN");
    // Claude Code plugin install + domain-scoped KILROY_URL
    expect(script).toContain(".claude/settings.local.json");
    expect(script).toContain("claude plugin install");
    expect(script).toContain("if command -v claude >/dev/null 2>&1");
    expect(script).toContain('"KILROY_URL": "https://kilroy.example.com"');
    // Codex bundle .mcp.json resolved to this instance (no env template)
    expect(script).toContain('"url": "https://kilroy.example.com/mcp"');
    expect(script).not.toContain("${KILROY_URL:-");
  });

  it("bootstraps the Codex plugin bundle when executed", () => {
    const root = mkdtempSync(join(tmpdir(), "kilroy-install-"));
    const homeDir = join(root, "home");
    const workDir = join(root, "work");
    const binDir = join(root, "bin");
    const scriptPath = join(root, "install.sh");

    mkdirSync(homeDir, { recursive: true });
    mkdirSync(workDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });

    const bunPath = Bun.which("bun");
    expect(bunPath).toBeTruthy();
    const bunShim = join(binDir, "bun");
    writeFileSync(bunShim, `#!/usr/bin/env sh\nexec "${bunPath}" "$@"\n`);
    chmodSync(bunShim, 0o755);

    const script = generateUniversalInstallScript("https://kilroy.example.com");
    writeFileSync(scriptPath, script);
    chmodSync(scriptPath, 0o755);

    const result = Bun.spawnSync({
      cmd: ["/bin/sh", scriptPath],
      cwd: workDir,
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
    expect(stdout).toContain("Setting up Kilroy...");
    expect(stdout).toContain("Codex plugin installed");

    // Domain-scoped: no project mapping written
    expect(existsSync(join(workDir, ".kilroy/config.toml"))).toBe(false);

    // No project-level .codex/config.toml (Codex uses plugin OAuth)
    expect(existsSync(join(workDir, ".codex/config.toml"))).toBe(false);

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
    expect(homePluginManifest.mcpServers).toBe("./.codex-plugin/mcp.json");

    // Bundled codex MCP config points at the instance that served the script
    const bundledMcp = JSON.parse(
      readFileSync(
        join(homeDir, ".agents/plugins/kilroy/.codex-plugin/mcp.json"),
        "utf8",
      ),
    );
    expect(bundledMcp.mcpServers.kilroy.url).toBe(
      "https://kilroy.example.com/mcp",
    );

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
    expect(homeCodexConfig).not.toContain('trust_level = "trusted"');
  });

  it("project variant writes the mapping but keeps every URL domain-scoped", () => {
    const script = generateProjectInstallScript(
      "https://kilroy.example.com",
      "srijan",
      "sagaland",
    );

    // Project mapping + Codex repo trust
    expect(script).toContain("cat > .kilroy/config.toml");
    expect(script).toContain('project = "srijan/sagaland"');
    expect(script).toContain('trust_level = "trusted"');
    // KILROY_URL is the origin — never the project URL
    expect(script).toContain('"KILROY_URL": "https://kilroy.example.com"');
    expect(script).not.toContain(
      '"KILROY_URL": "https://kilroy.example.com/srijan/sagaland"',
    );
    // Codex bundle + OpenCode MCP entries resolved to the instance root /mcp
    expect(script).toContain('"url": "https://kilroy.example.com/mcp"');
    expect(script).not.toContain("/srijan/sagaland/mcp");
    expect(script).not.toContain("${KILROY_URL:-");
  });

  it("project variant bootstraps mapping and trust when executed in a repo", () => {
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

    const script = generateProjectInstallScript(
      "https://kilroy.example.com",
      "srijan",
      "sagaland",
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

    // Bundled codex MCP config points at the instance origin, not the project
    const bundledMcp = JSON.parse(
      readFileSync(
        join(homeDir, ".agents/plugins/kilroy/.codex-plugin/mcp.json"),
        "utf8",
      ),
    );
    expect(bundledMcp.mcpServers.kilroy.url).toBe(
      "https://kilroy.example.com/mcp",
    );

    // Repo trust recorded in ~/.codex/config.toml
    const homeCodexConfig = readFileSync(
      join(homeDir, ".codex/config.toml"),
      "utf8",
    );
    expect(homeCodexConfig).toContain(
      `[projects."${realpathSync(projectDir)}"]`,
    );
    expect(homeCodexConfig).toContain('trust_level = "trusted"');
  });

  it("includes OpenCode plugin and MCP entries pointed at the serving domain", () => {
    const script = generateUniversalInstallScript("https://kilroy.example.com");

    // Guards on the `opencode` binary being present
    expect(script).toContain("command -v opencode");
    // Writes to the OpenCode config path
    expect(script).toContain(".config/opencode/opencode.json");
    // Registers the thin repo as a plugin entry
    expect(script).toContain(
      "kilroy@git+https://github.com/kilroy-sh/kilroy-opencode.git",
    );
    // Registers Kilroy MCP as a remote server with OAuth at the ROOT /mcp
    // endpoint of the instance that served the script
    expect(script).toContain('"type": "remote"');
    expect(script).toContain('"url": "https://kilroy.example.com/mcp"');
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
