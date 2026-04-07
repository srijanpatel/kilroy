import { describe, it, expect, beforeAll, afterAll, setDefaultTimeout } from "bun:test";
import { spawn } from "child_process";

setDefaultTimeout(30_000);

describe("CLI integration tests", () => {
  const PORT = 7433;
  const SERVER_URL = `http://localhost:${PORT}`;
  const TEST_ACCOUNT_SLUG = "cli-test";
  const TEST_PROJECT_SLUG = "cli-project";
  const PROJECT_API = `${SERVER_URL}/${TEST_ACCOUNT_SLUG}/${TEST_PROJECT_SLUG}`;
  const CLI = ["bun", "run", "src/cli/index.ts", "--server", PROJECT_API];

  let serverProc: ReturnType<typeof spawn>;
  let workspaceToken: string;

  async function cli(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      const proc = spawn(CLI[0], [...CLI.slice(1), ...args], {
        env: { ...process.env, KILROY_URL: undefined, KILROY_TOKEN: workspaceToken, KILROY_SESSION_ID: undefined, CLAUDE_SESSION_ID: undefined },
      });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d: any) => (stdout += d));
      proc.stderr.on("data", (d: any) => (stderr += d));
      proc.on("close", (code: any) => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code || 0 }));
    });
  }

  async function apiPost(path: string, body: any): Promise<any> {
    const res = await fetch(`${PROJECT_API}/api${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${workspaceToken}`,
      },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function apiDelete(path: string): Promise<void> {
    await fetch(`${PROJECT_API}/api${path}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${workspaceToken}` },
    });
  }

  async function waitForServer(url: string, maxMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      try {
        const res = await fetch(`${url}/api/stats`);
        if (res.ok) return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error("Server did not start in time");
  }

  beforeAll(async () => {
    serverProc = spawn("bun", ["run", "src/server.ts"], {
      env: { ...process.env, KILROY_PORT: String(PORT), DATABASE_URL: process.env.DATABASE_URL },
      stdio: "pipe",
    });

    // Wait for server to be ready (it runs initDatabase on startup)
    await waitForServer(SERVER_URL);

    // Use the DB directly to create test account + project + membership
    const { client } = await import("../src/db");
    const { uuidv7 } = await import("../src/lib/uuid");

    // Create test account
    const accountId = uuidv7();
    await client.unsafe(`
      INSERT INTO accounts (id, slug, display_name, auth_user_id)
      VALUES ('${accountId}', '${TEST_ACCOUNT_SLUG}', 'CLI Test', 'cli-test-user')
      ON CONFLICT (slug) DO UPDATE SET slug = '${TEST_ACCOUNT_SLUG}'
    `);

    // Get the actual account ID (in case ON CONFLICT hit)
    const [acctRow] = await client.unsafe(`SELECT id FROM accounts WHERE slug = '${TEST_ACCOUNT_SLUG}'`);
    const finalAccountId = acctRow.id;

    // Create test project
    const projectId = uuidv7();
    const inviteToken = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await client.unsafe(`
      INSERT INTO projects (id, slug, account_id, invite_token)
      VALUES ('${projectId}', '${TEST_PROJECT_SLUG}', '${finalAccountId}', '${inviteToken}')
      ON CONFLICT (account_id, slug) DO NOTHING
    `);

    // Get the actual project ID (in case ON CONFLICT hit)
    const [projRow] = await client.unsafe(`
      SELECT id FROM projects WHERE slug = '${TEST_PROJECT_SLUG}' AND account_id = '${finalAccountId}'
    `);
    const finalProjectId = projRow.id;

    // Create owner membership with a member_key
    const memberKeyHex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const memberKey = `klry_proj_${memberKeyHex}`;
    const memberId = uuidv7();
    await client.unsafe(`
      INSERT INTO project_members (id, project_id, account_id, member_key, role)
      VALUES ('${memberId}', '${finalProjectId}', '${finalAccountId}', '${memberKey}', 'owner')
      ON CONFLICT (project_id, account_id) DO UPDATE SET member_key = '${memberKey}'
    `);

    // Get the actual member key (in case ON CONFLICT updated it)
    const [memberRow] = await client.unsafe(`
      SELECT member_key FROM project_members WHERE project_id = '${finalProjectId}' AND account_id = '${finalAccountId}'
    `);
    workspaceToken = memberRow.member_key;
  });

  afterAll(async () => {
    serverProc?.kill();
    try {
      const { client } = await import("../src/db");
      await client.unsafe(`DELETE FROM comments WHERE project_id IN (SELECT id FROM projects WHERE account_id IN (SELECT id FROM accounts WHERE slug = '${TEST_ACCOUNT_SLUG}'))`);
      await client.unsafe(`DELETE FROM posts WHERE project_id IN (SELECT id FROM projects WHERE account_id IN (SELECT id FROM accounts WHERE slug = '${TEST_ACCOUNT_SLUG}'))`);
      await client.unsafe(`DELETE FROM project_members WHERE account_id IN (SELECT id FROM accounts WHERE slug = '${TEST_ACCOUNT_SLUG}')`);
      await client.unsafe(`DELETE FROM projects WHERE account_id IN (SELECT id FROM accounts WHERE slug = '${TEST_ACCOUNT_SLUG}')`);
      await client.unsafe(`DELETE FROM accounts WHERE slug = '${TEST_ACCOUNT_SLUG}'`);
    } catch {}
  });

  describe("kilroy ls", () => {
    it("lists empty root", async () => {
      const { stdout, code } = await cli("ls", "--json");
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.path).toBe("");
    });

    it("lists posts after creation", async () => {
      const post = await apiPost("/posts", {
        title: "CLI test ls",
        topic: "cli-test",
        body: "test body",
      });

      const { stdout, code } = await cli("ls", "cli-test", "--json");
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.posts.length).toBeGreaterThanOrEqual(1);
      expect(data.posts.some((p: any) => p.id === post.id)).toBe(true);

      await apiDelete(`/posts/${post.id}`);
    });

    it("supports --recursive flag", async () => {
      const post = await apiPost("/posts", {
        title: "Deep post",
        topic: "cli-test/deep/nested",
        body: "nested body",
      });

      const { stdout, code } = await cli("ls", "-r", "cli-test", "--json");
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.posts.some((p: any) => p.id === post.id)).toBe(true);

      await apiDelete(`/posts/${post.id}`);
    });
  });

  describe("kilroy read", () => {
    it("reads a post with --json", async () => {
      const post = await apiPost("/posts", {
        title: "CLI test read",
        topic: "cli-test",
        body: "read me",
      });

      const { stdout, code } = await cli("read", post.id, "--json");
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.title).toBe("CLI test read");
      expect(data.body).toBe("read me");

      await apiDelete(`/posts/${post.id}`);
    });

    it("shows formatted output on TTY-like invocation", async () => {
      const post = await apiPost("/posts", {
        title: "Formatted post",
        topic: "cli-test",
        body: "formatted body",
      });

      const { stdout, code } = await cli("read", post.id);
      expect(code).toBe(0);
      expect(stdout).toContain("formatted body");

      await apiDelete(`/posts/${post.id}`);
    });

    it("exits 2 for non-existent post", async () => {
      const { code, stderr } = await cli("read", "nonexistent-id");
      expect(code).toBe(2);
      expect(stderr).toContain("not found");
    });
  });

  describe("kilroy grep", () => {
    it("searches posts", async () => {
      const post = await apiPost("/posts", {
        title: "Searchable post",
        topic: "cli-test",
        body: "unique_searchterm_xyz for testing",
      });

      const { stdout, code } = await cli("grep", "unique_searchterm_xyz", "--json");
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.results.length).toBeGreaterThanOrEqual(1);
      expect(data.results[0].post_id).toBe(post.id);

      await apiDelete(`/posts/${post.id}`);
    });

    it("filters by topic", async () => {
      const post = await apiPost("/posts", {
        title: "Topic filtered",
        topic: "grep-topic-test",
        body: "filterable_xyz content",
      });

      const { stdout, code } = await cli("grep", "filterable_xyz", "grep-topic-test", "--json");
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.results.length).toBeGreaterThanOrEqual(1);

      await apiDelete(`/posts/${post.id}`);
    });
  });

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

      await apiDelete(`/posts/${data.id}`);
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

      await apiDelete(`/posts/${data.id}`);
    });
  });

  describe("kilroy comment", () => {
    it("adds a comment with --body", async () => {
      const post = await apiPost("/posts", {
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

      await apiDelete(`/posts/${post.id}`);
    });
  });

  describe("kilroy status", () => {
    it("archives a post", async () => {
      const post = await apiPost("/posts", {
        title: "Status test",
        topic: "cli-test",
        body: "body",
      });

      const { stdout, code } = await cli("archive", post.id, "--json");
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.status).toBe("archived");

      await apiDelete(`/posts/${post.id}`);
    });

    it("restores an archived post", async () => {
      const post = await apiPost("/posts", {
        title: "Restore test",
        topic: "cli-test",
        body: "body",
      });

      await cli("archive", post.id);
      const { stdout, code } = await cli("restore", post.id, "--json");
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.status).toBe("active");

      await apiDelete(`/posts/${post.id}`);
    });

    it("changes status with status command", async () => {
      const post = await apiPost("/posts", {
        title: "Explicit status",
        topic: "cli-test",
        body: "body",
      });

      const { stdout, code } = await cli("status", post.id, "obsolete", "--json");
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.status).toBe("obsolete");

      await apiDelete(`/posts/${post.id}`);
    });
  });

  describe("kilroy rm", () => {
    it("deletes a post", async () => {
      const post = await apiPost("/posts", {
        title: "Delete me",
        topic: "cli-test",
        body: "body",
      });

      const { stdout, code } = await cli("rm", post.id, "--json");
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.deleted).toBe(true);

      const { code: readCode } = await cli("read", post.id);
      expect(readCode).toBe(2);
    });
  });

  describe("kilroy find", () => {
    it("finds posts by tag", async () => {
      const post = await apiPost("/posts", {
        title: "Find by tag",
        topic: "cli-test",
        body: "tagged",
        tags: ["findme"],
      });

      const { stdout, code } = await cli("find", "--tag", "findme", "--json");
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.results.some((r: any) => r.id === post.id)).toBe(true);

      await apiDelete(`/posts/${post.id}`);
    });

    it("requires at least one filter", async () => {
      const { code, stderr } = await cli("find");
      expect(code).toBe(1);
    });
  });

  describe("kilroy edit", () => {
    it("edits a post title", async () => {
      const post = await apiPost("/posts", {
        title: "Original title",
        topic: "cli-test",
        body: "body",
      });

      const { stdout, code } = await cli(
        "edit", post.id,
        "--title", "Updated title",
        "--json"
      );
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.title).toBe("Updated title");

      await apiDelete(`/posts/${post.id}`);
    });

    it("edits a comment", async () => {
      const post = await apiPost("/posts", {
        title: "Comment edit target",
        topic: "cli-test",
        body: "body",
      });

      const comment = await (await fetch(`${PROJECT_API}/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${workspaceToken}`,
        },
        body: JSON.stringify({ body: "original comment" }),
      })).json();

      const { stdout, code } = await cli(
        "edit", post.id, comment.id,
        "--body", "updated comment",
        "--json"
      );
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.body).toBe("updated comment");

      await apiDelete(`/posts/${post.id}`);
    });
  });

  describe("kilroy ls --quiet", () => {
    it("outputs only post IDs", async () => {
      const post = await apiPost("/posts", {
        title: "Quiet test",
        topic: "cli-test",
        body: "body",
      });

      const { stdout, code } = await cli("ls", "-q", "cli-test");
      expect(code).toBe(0);
      expect(stdout).toContain(post.id);
      expect(stdout).not.toContain("Quiet test");

      await apiDelete(`/posts/${post.id}`);
    });
  });

  describe("kilroy grep --quiet", () => {
    it("outputs only post IDs", async () => {
      const post = await apiPost("/posts", {
        title: "Grep quiet test",
        topic: "cli-test",
        body: "unique_quiet_grep_term",
      });

      const { stdout, code } = await cli("grep", "-q", "unique_quiet_grep_term");
      expect(code).toBe(0);
      expect(stdout).toContain(post.id);
      expect(stdout).not.toContain("Grep quiet test");

      await apiDelete(`/posts/${post.id}`);
    });
  });

  describe("kilroy edit (error cases)", () => {
    it("errors when no fields provided", async () => {
      const post = await apiPost("/posts", {
        title: "Edit error test",
        topic: "cli-test",
        body: "body",
      });

      const { code, stderr } = await cli("edit", post.id);
      expect(code).toBe(1);

      await apiDelete(`/posts/${post.id}`);
    });
  });
});
