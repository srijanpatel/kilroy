import { describe, it, expect, beforeEach } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Use test database
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://kilroy:kilroy@localhost:5432/kilroy_test";

import { createMcpServer } from "../src/mcp/server";
import { resetDb, testTeamId } from "./helpers";

let client: Client;

async function setupMcp() {
  await resetDb();

  // Import testTeamId after resetDb populates it
  const { testTeamId: teamId } = await import("./helpers");
  const mcp = createMcpServer(teamId);
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

  it("registers all 9 tools", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "kilroy_browse",
      "kilroy_comment",
      "kilroy_create_post",
      "kilroy_delete_post",
      "kilroy_read_post",
      "kilroy_search",
      "kilroy_update_comment",
      "kilroy_update_post",
      "kilroy_update_post_status",
    ]);
  });

  it("each tool has a description", async () => {
    const result = await client.listTools();
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
    }
  });
});

// ─── kilroy_create_post ────────────────────────────────────────

describe("kilroy_create_post", () => {
  beforeEach(setupMcp);

  it("creates a post and returns it", async () => {
    const { data } = await callTool("kilroy_create_post", {
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
    const { data, isError } = await callTool("kilroy_create_post", {
      title: "missing body",
      topic: "test",
      body: "",
    });
    expect(isError).toBe(true);
    expect(data.code).toBe("INVALID_INPUT");
  });
});

// ─── kilroy_read_post ──────────────────────────────────────────

describe("kilroy_read_post", () => {
  beforeEach(setupMcp);

  it("reads a post with comments", async () => {
    const { data: post } = await callTool("kilroy_create_post", {
      title: "Test",
      topic: "test",
      body: "Test body",
      author: "claude-test",
    });

    await callTool("kilroy_comment", {
      post_id: post.id,
      body: "Great find!",
      author: "human:sarah",
    });

    const { data } = await callTool("kilroy_read_post", { post_id: post.id });

    expect(data.title).toBe("Test");
    expect(data.body).toBe("Test body");
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].author).toBe("human:sarah");
    expect(data.contributors).toContain("claude-test");
    expect(data.contributors).toContain("human:sarah");
  });

  it("returns error for non-existent post", async () => {
    const { data, isError } = await callTool("kilroy_read_post", {
      post_id: "nonexistent",
    });
    expect(isError).toBe(true);
    expect(data.error).toBe("Post not found");
  });
});

// ─── kilroy_browse ──────────────────────────────────────────────

describe("kilroy_browse", () => {
  beforeEach(setupMcp);

  it("browses root with subtopics", async () => {
    await callTool("kilroy_create_post", {
      title: "Auth post",
      topic: "auth",
      body: "Auth content",
    });
    await callTool("kilroy_create_post", {
      title: "Google auth post",
      topic: "auth/google",
      body: "Google auth content",
    });
    await callTool("kilroy_create_post", {
      title: "Deploy post",
      topic: "deployments/staging",
      body: "Deploy content",
    });

    const { data } = await callTool("kilroy_browse", {});

    expect(data.path).toBe("");
    expect(data.subtopics.map((s: any) => s.name).sort()).toEqual([
      "auth",
      "deployments",
    ]);
  });

  it("browses a specific topic", async () => {
    await callTool("kilroy_create_post", {
      title: "Post A",
      topic: "auth/google",
      body: "Content A",
    });

    const { data } = await callTool("kilroy_browse", { topic: "auth/google" });
    expect(data.path).toBe("auth/google");
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0].title).toBe("Post A");
  });

  it("supports recursive mode", async () => {
    await callTool("kilroy_create_post", { title: "A", topic: "auth", body: "a" });
    await callTool("kilroy_create_post", { title: "B", topic: "auth/google", body: "b" });

    const { data } = await callTool("kilroy_browse", {
      topic: "auth",
      recursive: true,
    });

    expect(data.posts).toHaveLength(2);
    expect(data.subtopics).toBeUndefined();
  });

  it("supports pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await callTool("kilroy_create_post", {
        title: `Post ${i}`,
        topic: "paginate",
        body: `Body ${i}`,
      });
    }

    const { data: page1 } = await callTool("kilroy_browse", {
      topic: "paginate",
      limit: 2,
    });
    expect(page1.posts).toHaveLength(2);
    expect(page1.has_more).toBe(true);

    const { data: page2 } = await callTool("kilroy_browse", {
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

// ─── kilroy_search ──────────────────────────────────────────────

describe("kilroy_search", () => {
  beforeEach(setupMcp);

  it("finds posts by content", async () => {
    await callTool("kilroy_create_post", {
      title: "Race condition in auth",
      topic: "auth",
      body: "Found a race condition in token refresh",
    });

    const { data } = await callTool("kilroy_search", { query: "race condition" });

    expect(data.results).toHaveLength(1);
    expect(data.results[0].title).toBe("Race condition in auth");
  });

  it("filters by topic", async () => {
    await callTool("kilroy_create_post", {
      title: "Auth race",
      topic: "auth",
      body: "race condition",
    });
    await callTool("kilroy_create_post", {
      title: "Deploy race",
      topic: "deploy",
      body: "race condition",
    });

    const { data } = await callTool("kilroy_search", {
      query: "race",
      topic: "auth",
    });
    expect(data.results).toHaveLength(1);
    expect(data.results[0].topic).toBe("auth");
  });
});

// ─── kilroy_comment ──────────────────────────────────────────────

describe("kilroy_comment", () => {
  beforeEach(setupMcp);

  it("adds a comment to a post", async () => {
    const { data: post } = await callTool("kilroy_create_post", {
      title: "Test",
      topic: "test",
      body: "Content",
    });

    const { data } = await callTool("kilroy_comment", {
      post_id: post.id,
      body: "Great find!",
      author: "human:sarah",
    });

    expect(data.id).toMatch(/^[0-9a-f-]+$/);
    expect(data.post_id).toBe(post.id);
    expect(data.author).toBe("human:sarah");
  });

  it("returns error for non-existent post", async () => {
    const { data, isError } = await callTool("kilroy_comment", {
      post_id: "nonexistent",
      body: "test",
    });
    expect(isError).toBe(true);
    expect(data.code).toBe("NOT_FOUND");
  });
});

// ─── kilroy_update_post_status ──────────────────────────────────

describe("kilroy_update_post_status", () => {
  beforeEach(setupMcp);

  it("archives an active post", async () => {
    const { data: post } = await callTool("kilroy_create_post", {
      title: "Test",
      topic: "test",
      body: "Content",
    });

    const { data } = await callTool("kilroy_update_post_status", {
      post_id: post.id,
      status: "archived",
    });

    expect(data.status).toBe("archived");
  });

  it("rejects invalid transition", async () => {
    const { data: post } = await callTool("kilroy_create_post", {
      title: "Test",
      topic: "test",
      body: "Content",
    });

    await callTool("kilroy_update_post_status", {
      post_id: post.id,
      status: "archived",
    });

    const { data, isError } = await callTool("kilroy_update_post_status", {
      post_id: post.id,
      status: "obsolete",
    });
    expect(isError).toBe(true);
    expect(data.code).toBe("INVALID_TRANSITION");
  });
});

// ─── kilroy_update_post ───────────────────────────────────────

describe("kilroy_update_post", () => {
  beforeEach(setupMcp);

  it("updates a post's body", async () => {
    const { data: post } = await callTool("kilroy_create_post", {
      title: "Original",
      topic: "test",
      body: "Original body",
      author: "claude-session-1",
    });

    const { data } = await callTool("kilroy_update_post", {
      post_id: post.id,
      body: "Updated body with src/new/path.ts",
      author: "claude-session-1",
    });

    expect(data.id).toBe(post.id);
    expect(data.files).toContain("src/new/path.ts");
  });

  it("rejects when author does not match", async () => {
    const { data: post } = await callTool("kilroy_create_post", {
      title: "Test",
      topic: "test",
      body: "Content",
      author: "claude-session-1",
    });

    const { data, isError } = await callTool("kilroy_update_post", {
      post_id: post.id,
      title: "Hacked",
      author: "claude-session-2",
    });

    expect(isError).toBe(true);
    expect(data.code).toBe("AUTHOR_MISMATCH");
  });

  it("returns error for non-existent post", async () => {
    const { data, isError } = await callTool("kilroy_update_post", {
      post_id: "nonexistent",
      title: "test",
    });
    expect(isError).toBe(true);
    expect(data.code).toBe("NOT_FOUND");
  });
});

// ─── kilroy_update_comment ────────────────────────────────────

describe("kilroy_update_comment", () => {
  beforeEach(setupMcp);

  it("updates a comment's body", async () => {
    const { data: post } = await callTool("kilroy_create_post", {
      title: "Test",
      topic: "test",
      body: "Content",
    });

    const { data: comment } = await callTool("kilroy_comment", {
      post_id: post.id,
      body: "Original comment",
      author: "claude-session-1",
    });

    const { data } = await callTool("kilroy_update_comment", {
      post_id: post.id,
      comment_id: comment.id,
      body: "Updated comment",
      author: "claude-session-1",
    });

    expect(data.body).toBe("Updated comment");
    expect(data.id).toBe(comment.id);
  });

  it("rejects when author does not match", async () => {
    const { data: post } = await callTool("kilroy_create_post", {
      title: "Test",
      topic: "test",
      body: "Content",
    });

    const { data: comment } = await callTool("kilroy_comment", {
      post_id: post.id,
      body: "My comment",
      author: "claude-session-1",
    });

    const { data, isError } = await callTool("kilroy_update_comment", {
      post_id: post.id,
      comment_id: comment.id,
      body: "Hacked",
      author: "claude-session-2",
    });

    expect(isError).toBe(true);
    expect(data.code).toBe("AUTHOR_MISMATCH");
  });

  it("returns error for non-existent comment", async () => {
    const { data: post } = await callTool("kilroy_create_post", {
      title: "Test",
      topic: "test",
      body: "Content",
    });

    const { data, isError } = await callTool("kilroy_update_comment", {
      post_id: post.id,
      comment_id: "nonexistent",
      body: "test",
    });

    expect(isError).toBe(true);
    expect(data.code).toBe("NOT_FOUND");
  });
});

// ─── kilroy_delete_post ──────────────────────────────────────────

describe("kilroy_delete_post", () => {
  beforeEach(setupMcp);

  it("deletes a post", async () => {
    const { data: post } = await callTool("kilroy_create_post", {
      title: "Test",
      topic: "test",
      body: "Content",
    });

    const { data } = await callTool("kilroy_delete_post", { post_id: post.id });

    expect(data.deleted).toBe(true);
    expect(data.post_id).toBe(post.id);

    // Verify it's gone
    const { isError } = await callTool("kilroy_read_post", { post_id: post.id });
    expect(isError).toBe(true);
  });

  it("returns error for non-existent post", async () => {
    const { data, isError } = await callTool("kilroy_delete_post", {
      post_id: "nonexistent",
    });
    expect(isError).toBe(true);
    expect(data.code).toBe("NOT_FOUND");
  });
});
