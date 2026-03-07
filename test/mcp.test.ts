import { describe, it, expect, beforeEach } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/mcp/server";

// Use in-memory database for tests
process.env.HEARSAY_DB_PATH = ":memory:";

let client: Client;

async function setupMcp() {
  const { initDatabase, sqlite } = require("../src/db");

  // Fresh DB state
  try {
    sqlite.exec("DROP TABLE IF EXISTS comments_fts");
    sqlite.exec("DROP TABLE IF EXISTS posts_fts");
    sqlite.exec("DROP TABLE IF EXISTS comments");
    sqlite.exec("DROP TABLE IF EXISTS posts");
  } catch {}
  initDatabase();

  const mcp = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await mcp.connect(serverTransport);

  client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  return { data: JSON.parse(text), isError: result.isError };
}

// ─── Tool Registration ─────────────────────────────────────────

describe("MCP tool registration", () => {
  beforeEach(setupMcp);

  it("registers all 7 tools", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "hearsay_browse",
      "hearsay_comment",
      "hearsay_create_post",
      "hearsay_delete_post",
      "hearsay_read_post",
      "hearsay_search",
      "hearsay_update_post_status",
    ]);
  });

  it("each tool has a description", async () => {
    const result = await client.listTools();
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
    }
  });
});

// ─── hearsay_create_post ────────────────────────────────────────

describe("hearsay_create_post", () => {
  beforeEach(setupMcp);

  it("creates a post and returns it", async () => {
    const { data } = await callTool("hearsay_create_post", {
      title: "OAuth gotcha",
      topic: "auth/google",
      body: "Redirect URI must match exactly. See src/auth/oauth.ts for details.",
      tags: ["oauth", "gotcha"],
      author: "claude-session-abc",
      commit_sha: "a1b2c3d",
    });

    expect(data.id).toMatch(/^[0-9a-f-]+$/);
    expect(data.title).toBe("OAuth gotcha");
    expect(data.topic).toBe("auth/google");
    expect(data.status).toBe("active");
    expect(data.tags).toEqual(["oauth", "gotcha"]);
    expect(data.files).toEqual(["src/auth/oauth.ts"]);
  });

  it("returns error for missing fields", async () => {
    const { data, isError } = await callTool("hearsay_create_post", {
      title: "missing body",
      topic: "test",
      body: "",
    });
    expect(isError).toBe(true);
    expect(data.code).toBe("INVALID_INPUT");
  });
});

// ─── hearsay_read_post ──────────────────────────────────────────

describe("hearsay_read_post", () => {
  beforeEach(setupMcp);

  it("reads a post with comments", async () => {
    const { data: post } = await callTool("hearsay_create_post", {
      title: "Test",
      topic: "test",
      body: "Test body",
      author: "claude-test",
    });

    await callTool("hearsay_comment", {
      post_id: post.id,
      body: "Great find!",
      author: "human:sarah",
    });

    const { data } = await callTool("hearsay_read_post", { post_id: post.id });

    expect(data.title).toBe("Test");
    expect(data.body).toBe("Test body");
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].author).toBe("human:sarah");
    expect(data.contributors).toContain("claude-test");
    expect(data.contributors).toContain("human:sarah");
  });

  it("returns error for non-existent post", async () => {
    const { data, isError } = await callTool("hearsay_read_post", {
      post_id: "nonexistent",
    });
    expect(isError).toBe(true);
    expect(data.error).toBe("Post not found");
  });
});

// ─── hearsay_browse ──────────────────────────────────────────────

describe("hearsay_browse", () => {
  beforeEach(setupMcp);

  it("browses root with subtopics", async () => {
    await callTool("hearsay_create_post", {
      title: "Auth post",
      topic: "auth",
      body: "Auth content",
    });
    await callTool("hearsay_create_post", {
      title: "Google auth post",
      topic: "auth/google",
      body: "Google auth content",
    });
    await callTool("hearsay_create_post", {
      title: "Deploy post",
      topic: "deployments/staging",
      body: "Deploy content",
    });

    const { data } = await callTool("hearsay_browse", {});

    expect(data.path).toBe("");
    expect(data.subtopics.map((s: any) => s.name).sort()).toEqual([
      "auth",
      "deployments",
    ]);
  });

  it("browses a specific topic", async () => {
    await callTool("hearsay_create_post", {
      title: "Post A",
      topic: "auth/google",
      body: "Content A",
    });

    const { data } = await callTool("hearsay_browse", { topic: "auth/google" });
    expect(data.path).toBe("auth/google");
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0].title).toBe("Post A");
  });

  it("supports recursive mode", async () => {
    await callTool("hearsay_create_post", { title: "A", topic: "auth", body: "a" });
    await callTool("hearsay_create_post", { title: "B", topic: "auth/google", body: "b" });

    const { data } = await callTool("hearsay_browse", {
      topic: "auth",
      recursive: true,
    });

    expect(data.posts).toHaveLength(2);
    expect(data.subtopics).toBeUndefined();
  });

  it("supports pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await callTool("hearsay_create_post", {
        title: `Post ${i}`,
        topic: "paginate",
        body: `Body ${i}`,
      });
    }

    const { data: page1 } = await callTool("hearsay_browse", {
      topic: "paginate",
      limit: 2,
    });
    expect(page1.posts).toHaveLength(2);
    expect(page1.has_more).toBe(true);

    const { data: page2 } = await callTool("hearsay_browse", {
      topic: "paginate",
      limit: 2,
      cursor: page1.next_cursor,
    });
    expect(page2.posts).toHaveLength(2);

    // No overlap
    const ids1 = page1.posts.map((p: any) => p.id);
    const ids2 = page2.posts.map((p: any) => p.id);
    expect(ids1.filter((id: string) => ids2.includes(id))).toHaveLength(0);
  });
});

// ─── hearsay_search ──────────────────────────────────────────────

describe("hearsay_search", () => {
  beforeEach(setupMcp);

  it("finds posts by content", async () => {
    await callTool("hearsay_create_post", {
      title: "Race condition in auth",
      topic: "auth",
      body: "Found a race condition in token refresh",
    });

    const { data } = await callTool("hearsay_search", { query: "race condition" });

    expect(data.results).toHaveLength(1);
    expect(data.results[0].title).toBe("Race condition in auth");
  });

  it("filters by topic", async () => {
    await callTool("hearsay_create_post", {
      title: "Auth race",
      topic: "auth",
      body: "race condition",
    });
    await callTool("hearsay_create_post", {
      title: "Deploy race",
      topic: "deploy",
      body: "race condition",
    });

    const { data } = await callTool("hearsay_search", {
      query: "race",
      topic: "auth",
    });
    expect(data.results).toHaveLength(1);
    expect(data.results[0].topic).toBe("auth");
  });
});

// ─── hearsay_comment ──────────────────────────────────────────────

describe("hearsay_comment", () => {
  beforeEach(setupMcp);

  it("adds a comment to a post", async () => {
    const { data: post } = await callTool("hearsay_create_post", {
      title: "Test",
      topic: "test",
      body: "Content",
    });

    const { data } = await callTool("hearsay_comment", {
      post_id: post.id,
      body: "Great find!",
      author: "human:sarah",
    });

    expect(data.id).toMatch(/^[0-9a-f-]+$/);
    expect(data.post_id).toBe(post.id);
    expect(data.author).toBe("human:sarah");
  });

  it("returns error for non-existent post", async () => {
    const { data, isError } = await callTool("hearsay_comment", {
      post_id: "nonexistent",
      body: "test",
    });
    expect(isError).toBe(true);
    expect(data.code).toBe("NOT_FOUND");
  });
});

// ─── hearsay_update_post_status ──────────────────────────────────

describe("hearsay_update_post_status", () => {
  beforeEach(setupMcp);

  it("archives an active post", async () => {
    const { data: post } = await callTool("hearsay_create_post", {
      title: "Test",
      topic: "test",
      body: "Content",
    });

    const { data } = await callTool("hearsay_update_post_status", {
      post_id: post.id,
      status: "archived",
    });

    expect(data.status).toBe("archived");
  });

  it("rejects invalid transition", async () => {
    const { data: post } = await callTool("hearsay_create_post", {
      title: "Test",
      topic: "test",
      body: "Content",
    });

    await callTool("hearsay_update_post_status", {
      post_id: post.id,
      status: "archived",
    });

    const { data, isError } = await callTool("hearsay_update_post_status", {
      post_id: post.id,
      status: "obsolete",
    });
    expect(isError).toBe(true);
    expect(data.code).toBe("INVALID_TRANSITION");
  });
});

// ─── hearsay_delete_post ──────────────────────────────────────────

describe("hearsay_delete_post", () => {
  beforeEach(setupMcp);

  it("deletes a post", async () => {
    const { data: post } = await callTool("hearsay_create_post", {
      title: "Test",
      topic: "test",
      body: "Content",
    });

    const { data } = await callTool("hearsay_delete_post", { post_id: post.id });

    expect(data.deleted).toBe(true);
    expect(data.post_id).toBe(post.id);

    // Verify it's gone
    const { isError } = await callTool("hearsay_read_post", { post_id: post.id });
    expect(isError).toBe(true);
  });

  it("returns error for non-existent post", async () => {
    const { data, isError } = await callTool("hearsay_delete_post", {
      post_id: "nonexistent",
    });
    expect(isError).toBe(true);
    expect(data.code).toBe("NOT_FOUND");
  });
});
