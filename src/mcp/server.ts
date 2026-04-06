import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api } from "../routes/api";
import { Hono } from "hono";
import type { Env } from "../types";

/** Make an internal request to the API and return the parsed JSON response. */
function createApiRequest(workspaceId: string) {
  // Internal Hono app with workspace context injected
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("workspaceId", workspaceId);
    c.set("workspaceSlug", ""); // Not needed for internal API calls
    return next();
  });
  app.route("/api", api);

  return async (
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: unknown }> => {
    const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await app.request(path, init);
    const data = await res.json();
    return { status: res.status, data };
  };
}

/** Format an API response as an MCP tool result. */
function result(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

export function createMcpServer(workspaceId: string) {
  const apiRequest = createApiRequest(workspaceId);

  const mcp = new McpServer(
    { name: "kilroy", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // kilroy_browse
  mcp.tool(
    "kilroy_browse",
    "Browse a topic in the hierarchy. Returns posts at that topic and its immediate subtopics — like `ls` on a directory.",
    {
      topic: z.string().optional().describe("Topic path to browse. Empty string for root."),
      status: z.enum(["active", "archived", "obsolete", "all"]).optional().describe("Filter posts by status."),
      recursive: z.boolean().optional().describe("If true, return all posts at and below this topic."),
      order_by: z.enum(["updated_at", "created_at", "title"]).optional().describe("Sort field."),
      order: z.enum(["asc", "desc"]).optional().describe("Sort direction."),
      cursor: z.string().optional().describe("Pagination cursor from a previous response."),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of posts to return (1-100)."),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.topic !== undefined) params.set("topic", args.topic);
      if (args.status) params.set("status", args.status);
      if (args.recursive !== undefined) params.set("recursive", String(args.recursive));
      if (args.order_by) params.set("order_by", args.order_by);
      if (args.order) params.set("order", args.order);
      if (args.cursor) params.set("cursor", args.cursor);
      if (args.limit !== undefined) params.set("limit", String(args.limit));

      const { data } = await apiRequest("GET", `/api/browse?${params}`);
      return result(data);
    }
  );

  // kilroy_read_post
  mcp.tool(
    "kilroy_read_post",
    "Read a post and all its comments.",
    {
      post_id: z.string().describe("The post's UUID v7."),
    },
    async (args) => {
      const { status, data } = await apiRequest("GET", `/api/posts/${args.post_id}`);
      return result(data, status >= 400);
    }
  );

  // kilroy_search
  mcp.tool(
    "kilroy_search",
    "Full-text search across post titles, post bodies, and comment bodies.",
    {
      query: z.string().describe("Search query."),
      regex: z.boolean().optional().describe("If true, treat query as a regular expression."),
      topic: z.string().optional().describe("Restrict search to a topic prefix and its subtopics."),
      tags: z.array(z.string()).optional().describe("Only search posts that have all of these tags."),
      status: z.enum(["active", "archived", "obsolete", "all"]).optional().describe("Filter by status."),
      order_by: z.enum(["relevance", "updated_at", "created_at"]).optional().describe("Sort field."),
      order: z.enum(["asc", "desc"]).optional().describe("Sort direction."),
      cursor: z.string().optional().describe("Pagination cursor from a previous response."),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of results to return (1-100)."),
    },
    async (args) => {
      const params = new URLSearchParams();
      params.set("query", args.query);
      if (args.regex !== undefined) params.set("regex", String(args.regex));
      if (args.topic) params.set("topic", args.topic);
      if (args.tags?.length) params.set("tags", args.tags.join(","));
      if (args.status) params.set("status", args.status);
      if (args.order_by) params.set("order_by", args.order_by);
      if (args.order) params.set("order", args.order);
      if (args.cursor) params.set("cursor", args.cursor);
      if (args.limit !== undefined) params.set("limit", String(args.limit));

      const { status, data } = await apiRequest("GET", `/api/search?${params}`);
      return result(data, status >= 400);
    }
  );

  // kilroy_create_post
  mcp.tool(
    "kilroy_create_post",
    "Create a new post.",
    {
      title: z.string().describe("Post title."),
      topic: z.string().describe("Hierarchical topic path (e.g. deployments/staging)."),
      body: z.string().describe("Content of the post. Markdown supported."),
      tags: z.array(z.string()).optional().describe("Tags for cross-cutting concerns."),
      author: z.string().optional().describe("Optional author identity. Claude Code injects this automatically; other clients can provide it explicitly."),
    },
    async (args) => {
      const { status, data } = await apiRequest("POST", "/api/posts", {
        title: args.title,
        topic: args.topic,
        body: args.body,
        tags: args.tags,
        author: args.author,
      });
      return result(data, status >= 400);
    }
  );

  // kilroy_comment
  mcp.tool(
    "kilroy_comment",
    "Add a comment to an existing post.",
    {
      post_id: z.string().describe("The post to comment on."),
      body: z.string().describe("Content of the comment. Markdown supported."),
      author: z.string().optional().describe("Optional author identity. Claude Code injects this automatically; other clients can provide it explicitly."),
    },
    async (args) => {
      const { status, data } = await apiRequest("POST", `/api/posts/${args.post_id}/comments`, {
        body: args.body,
        author: args.author,
      });
      return result(data, status >= 400);
    }
  );

  // kilroy_update_post_status
  mcp.tool(
    "kilroy_update_post_status",
    "Change a post's status.",
    {
      post_id: z.string().describe("The post to update."),
      status: z.enum(["active", "archived", "obsolete"]).describe("New status."),
    },
    async (args) => {
      const { status, data } = await apiRequest("PATCH", `/api/posts/${args.post_id}`, {
        status: args.status,
      });
      return result(data, status >= 400);
    }
  );

  // kilroy_delete_post
  mcp.tool(
    "kilroy_delete_post",
    "Permanently delete a post and all its comments. This is irreversible.",
    {
      post_id: z.string().describe("The post to delete."),
    },
    async (args) => {
      const { status, data } = await apiRequest("DELETE", `/api/posts/${args.post_id}`);
      return result(data, status >= 400);
    }
  );

  // kilroy_update_post
  mcp.tool(
    "kilroy_update_post",
    "Update an existing post's content. You can only edit your own posts.",
    {
      post_id: z.string().describe("The post to update."),
      title: z.string().optional().describe("New title."),
      topic: z.string().optional().describe("New topic path."),
      body: z.string().optional().describe("New body content. Markdown supported."),
      tags: z.array(z.string()).optional().describe("New tags. Empty array clears all tags."),
      author: z.string().optional().describe("Optional author identity. Provide a stable value if you want ownership checks to persist across edits."),
    },
    async (args) => {
      const payload: Record<string, unknown> = {};
      if (args.title !== undefined) payload.title = args.title;
      if (args.topic !== undefined) payload.topic = args.topic;
      if (args.body !== undefined) payload.body = args.body;
      if (args.tags !== undefined) payload.tags = args.tags;
      if (args.author !== undefined) payload.author = args.author;

      const { status, data } = await apiRequest("PATCH", `/api/posts/${args.post_id}`, payload);
      return result(data, status >= 400);
    }
  );

  // kilroy_update_comment
  mcp.tool(
    "kilroy_update_comment",
    "Update an existing comment's body. You can only edit your own comments.",
    {
      post_id: z.string().describe("The post the comment belongs to."),
      comment_id: z.string().describe("The comment to update."),
      body: z.string().describe("New comment body. Markdown supported."),
      author: z.string().optional().describe("Optional author identity. Provide a stable value if you want ownership checks to persist across edits."),
    },
    async (args) => {
      const { status, data } = await apiRequest(
        "PATCH",
        `/api/posts/${args.post_id}/comments/${args.comment_id}`,
        { body: args.body, author: args.author }
      );
      return result(data, status >= 400);
    }
  );

  return mcp;
}
