import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { spawn } from "child_process";

const PORT = 7433;
const SERVER_URL = `http://localhost:${PORT}`;
const TEAM_SLUG = "cli-test-team";
const TEAM_API = `${SERVER_URL}/${TEAM_SLUG}`;
const CLI = ["bun", "run", "src/cli/index.ts", "--server", TEAM_API];

let serverProc: ReturnType<typeof spawn>;
let teamToken: string;

async function cli(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(CLI[0], [...CLI.slice(1), ...args], {
      env: { ...process.env, KILROY_URL: undefined, KILROY_TOKEN: teamToken },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code || 0 }));
  });
}

async function apiPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${TEAM_API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${teamToken}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiDelete(path: string): Promise<void> {
  await fetch(`${TEAM_API}${path}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${teamToken}` },
  });
}

async function waitForServer(url: string, maxMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${url}/teams`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "__healthcheck__" }) });
      // Either 201 (created) or 409 (already exists) means server is up
      if (res.status === 201 || res.status === 409) {
        // Clean up the healthcheck team
        return;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("Server did not start in time");
}

beforeAll(async () => {
  // Start server on test port with test database
  serverProc = spawn("bun", ["run", "src/server.ts"], {
    env: { ...process.env, KILROY_PORT: String(PORT), DATABASE_URL: process.env.DATABASE_URL || "postgres://kilroy:kilroy@localhost:5432/kilroy_test" },
    stdio: "pipe",
  });
  await waitForServer(SERVER_URL);

  // Create a test team
  const res = await fetch(`${SERVER_URL}/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: TEAM_SLUG }),
  });
  const data = await res.json();
  teamToken = data.project_key;
});

afterAll(() => {
  serverProc?.kill();
});

// ─── ls ──────────────────────────────────────────────────────────

describe("kilroy ls", () => {
  it("lists empty root", async () => {
    const { stdout, code } = await cli("ls", "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.path).toBe("");
  });

  it("lists posts after creation", async () => {
    const post = await apiPost("/api/posts", {
      title: "CLI test ls",
      topic: "cli-test",
      body: "test body",
    });

    const { stdout, code } = await cli("ls", "cli-test", "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.posts.length).toBeGreaterThanOrEqual(1);
    expect(data.posts.some((p: any) => p.id === post.id)).toBe(true);

    await apiDelete(`/api/posts/${post.id}`);
  });

  it("supports --recursive flag", async () => {
    const post = await apiPost("/api/posts", {
      title: "Deep post",
      topic: "cli-test/deep/nested",
      body: "nested body",
    });

    const { stdout, code } = await cli("ls", "-r", "cli-test", "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.posts.some((p: any) => p.id === post.id)).toBe(true);

    await apiDelete(`/api/posts/${post.id}`);
  });
});

// ─── read ─────────────────────────────────────────────────────────

describe("kilroy read", () => {
  it("reads a post with --json", async () => {
    const post = await apiPost("/api/posts", {
      title: "CLI test read",
      topic: "cli-test",
      body: "read me",
    });

    const { stdout, code } = await cli("read", post.id, "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.title).toBe("CLI test read");
    expect(data.body).toBe("read me");

    await apiDelete(`/api/posts/${post.id}`);
  });

  it("shows formatted output on TTY-like invocation", async () => {
    const post = await apiPost("/api/posts", {
      title: "Formatted post",
      topic: "cli-test",
      body: "formatted body",
      author: "test-author",
    });

    const { stdout, code } = await cli("read", post.id);
    expect(code).toBe(0);
    expect(stdout).toContain("formatted body");

    await apiDelete(`/api/posts/${post.id}`);
  });

  it("exits 2 for non-existent post", async () => {
    const { code, stderr } = await cli("read", "nonexistent-id");
    expect(code).toBe(2);
    expect(stderr).toContain("not found");
  });
});

// ─── grep ────────────────────────────────────────────────────────

describe("kilroy grep", () => {
  it("searches posts", async () => {
    const post = await apiPost("/api/posts", {
      title: "Searchable post",
      topic: "cli-test",
      body: "unique_searchterm_xyz for testing",
    });

    const { stdout, code } = await cli("grep", "unique_searchterm_xyz", "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.results.length).toBeGreaterThanOrEqual(1);
    expect(data.results[0].post_id).toBe(post.id);

    await apiDelete(`/api/posts/${post.id}`);
  });

  it("filters by topic", async () => {
    const post = await apiPost("/api/posts", {
      title: "Topic filtered",
      topic: "grep-topic-test",
      body: "filterable_xyz content",
    });

    const { stdout, code } = await cli("grep", "filterable_xyz", "grep-topic-test", "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.results.length).toBeGreaterThanOrEqual(1);

    await apiDelete(`/api/posts/${post.id}`);
  });
});

// ─── post ────────────────────────────────────────────────────────

describe("kilroy post", () => {
  it("creates a post with --body", async () => {
    const { stdout, code } = await cli(
      "post", "cli-test",
      "--title", "Created via CLI",
      "--body", "CLI body content",
      "--json"
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.title).toBe("Created via CLI");
    expect(data.topic).toBe("cli-test");

    await apiDelete(`/api/posts/${data.id}`);
  });

  it("creates a post with tags", async () => {
    const { stdout, code } = await cli(
      "post", "cli-test",
      "--title", "Tagged post",
      "--body", "Has tags",
      "--tag", "alpha",
      "--tag", "beta",
      "--json"
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.tags).toEqual(["alpha", "beta"]);

    await apiDelete(`/api/posts/${data.id}`);
  });
});

// ─── comment ─────────────────────────────────────────────────────

describe("kilroy comment", () => {
  it("adds a comment with --body", async () => {
    const post = await apiPost("/api/posts", {
      title: "Comment target",
      topic: "cli-test",
      body: "target",
    });

    const { stdout, code } = await cli(
      "comment", post.id,
      "--body", "CLI comment",
      "--json"
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.post_id).toBe(post.id);

    await apiDelete(`/api/posts/${post.id}`);
  });
});

// ─── status / archive / obsolete / restore ───────────────────────

describe("kilroy status", () => {
  it("archives a post", async () => {
    const post = await apiPost("/api/posts", {
      title: "Status test",
      topic: "cli-test",
      body: "body",
    });

    const { stdout, code } = await cli("archive", post.id, "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.status).toBe("archived");

    await apiDelete(`/api/posts/${post.id}`);
  });

  it("restores an archived post", async () => {
    const post = await apiPost("/api/posts", {
      title: "Restore test",
      topic: "cli-test",
      body: "body",
    });

    await cli("archive", post.id);
    const { stdout, code } = await cli("restore", post.id, "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.status).toBe("active");

    await apiDelete(`/api/posts/${post.id}`);
  });

  it("changes status with status command", async () => {
    const post = await apiPost("/api/posts", {
      title: "Explicit status",
      topic: "cli-test",
      body: "body",
    });

    const { stdout, code } = await cli("status", post.id, "obsolete", "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.status).toBe("obsolete");

    await apiDelete(`/api/posts/${post.id}`);
  });
});

// ─── rm ──────────────────────────────────────────────────────────

describe("kilroy rm", () => {
  it("deletes a post", async () => {
    const post = await apiPost("/api/posts", {
      title: "Delete me",
      topic: "cli-test",
      body: "body",
    });

    const { stdout, code } = await cli("rm", post.id, "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.deleted).toBe(true);

    // Verify it's gone
    const { code: readCode } = await cli("read", post.id);
    expect(readCode).toBe(2);
  });
});

// ─── find ───────────────────────────────────────────────────────

describe("kilroy find", () => {
  it("finds posts by author", async () => {
    const post = await apiPost("/api/posts", {
      title: "Find by author",
      topic: "cli-test",
      body: "findable",
      author: "test-finder",
    });

    const { stdout, code } = await cli("find", "--author", "test-finder", "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.results.some((r: any) => r.id === post.id)).toBe(true);

    await apiDelete(`/api/posts/${post.id}`);
  });

  it("finds posts by tag", async () => {
    const post = await apiPost("/api/posts", {
      title: "Find by tag",
      topic: "cli-test",
      body: "tagged",
      tags: ["findme"],
    });

    const { stdout, code } = await cli("find", "--tag", "findme", "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.results.some((r: any) => r.id === post.id)).toBe(true);

    await apiDelete(`/api/posts/${post.id}`);
  });

  it("requires at least one filter", async () => {
    const { code, stderr } = await cli("find");
    expect(code).toBe(1);
  });
});

// ─── edit ───────────────────────────────────────────────────────

describe("kilroy edit", () => {
  it("edits a post title", async () => {
    const post = await apiPost("/api/posts", {
      title: "Original title",
      topic: "cli-test",
      body: "body",
      author: "editor",
    });

    const { stdout, code } = await cli(
      "edit", post.id,
      "--title", "Updated title",
      "--author", "editor",
      "--json"
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.title).toBe("Updated title");

    await apiDelete(`/api/posts/${post.id}`);
  });

  it("edits a comment", async () => {
    const post = await apiPost("/api/posts", {
      title: "Comment edit target",
      topic: "cli-test",
      body: "body",
    });

    const comment = await (await fetch(`${TEAM_API}/api/posts/${post.id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${teamToken}`,
      },
      body: JSON.stringify({ body: "original comment", author: "commenter" }),
    })).json();

    const { stdout, code } = await cli(
      "edit", post.id, comment.id,
      "--body", "updated comment",
      "--author", "commenter",
      "--json"
    );
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.body).toBe("updated comment");

    await apiDelete(`/api/posts/${post.id}`);
  });
});

// ─── --quiet flag ────────────────────────────────────────────────

describe("kilroy ls --quiet", () => {
  it("outputs only post IDs", async () => {
    const post = await apiPost("/api/posts", {
      title: "Quiet test",
      topic: "cli-test",
      body: "body",
    });

    const { stdout, code } = await cli("ls", "-q", "cli-test");
    expect(code).toBe(0);
    expect(stdout).toContain(post.id);
    // Should not contain title or topic
    expect(stdout).not.toContain("Quiet test");

    await apiDelete(`/api/posts/${post.id}`);
  });
});

describe("kilroy grep --quiet", () => {
  it("outputs only post IDs", async () => {
    const post = await apiPost("/api/posts", {
      title: "Grep quiet test",
      topic: "cli-test",
      body: "unique_quiet_grep_term",
    });

    const { stdout, code } = await cli("grep", "-q", "unique_quiet_grep_term");
    expect(code).toBe(0);
    expect(stdout).toContain(post.id);
    expect(stdout).not.toContain("Grep quiet test");

    await apiDelete(`/api/posts/${post.id}`);
  });
});

// ─── edit error cases ───────────────────────────────────────────

describe("kilroy edit (error cases)", () => {
  it("errors when no fields provided", async () => {
    const post = await apiPost("/api/posts", {
      title: "Edit error test",
      topic: "cli-test",
      body: "body",
    });

    const { code, stderr } = await cli("edit", post.id);
    expect(code).toBe(1);

    await apiDelete(`/api/posts/${post.id}`);
  });
});
