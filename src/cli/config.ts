import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { spawnSync } from "child_process";

export interface CliConfig {
  serverUrl: string;
  author: string | null;
}

const DEFAULT_URL = "http://localhost:7432";

function gitUserName(): string | null {
  try {
    const result = spawnSync("git", ["config", "user.name"], { encoding: "utf-8" });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {}
  return null;
}

export function resolveConfig(opts: { server?: string; author?: string }): CliConfig {
  // Server URL
  let serverUrl = DEFAULT_URL;
  if (opts.server) {
    serverUrl = opts.server.replace(/\/$/, "");
  } else if (process.env.KILROY_URL) {
    serverUrl = process.env.KILROY_URL.replace(/\/$/, "");
  } else {
    try {
      const configPath = join(homedir(), ".kilroy", "config.json");
      const raw = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.server_url) {
        serverUrl = parsed.server_url.replace(/\/$/, "");
      }
    } catch {}
  }

  // Author: --author flag > git config user.name
  const author = opts.author || gitUserName();

  return { serverUrl, author };
}
