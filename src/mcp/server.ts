import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api } from "../routes/api";
import { Hono } from "hono";
import type { Env } from "../types";

/** Make an internal request to the API and return the parsed JSON response. */
function createApiRequest(projectId: string, memberAccountId: string, authorType: "human" | "agent") {
  // Internal Hono app with project context injected
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("projectId", projectId);
    c.set("projectSlug", ""); // Not needed for internal API calls
    c.set("accountSlug", ""); // Not needed for internal API calls
    c.set("memberAccountId", memberAccountId);
    c.set("authorType", authorType);
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

export function createMcpServer(projectId: string, memberAccountId: string, authorType: "human" | "agent", projectUrl?: string) {
  const apiRequest = createApiRequest(projectId, memberAccountId, authorType);

  /** Build the web UI URL for a post. */
  const postUrl = (postId: string) => projectUrl ? `${projectUrl}/post/${postId}` : undefined;

  const mcp = new McpServer(
    { name: "kilroy", version: "0.1.0" },
    { capabilities: { tools: {} } }
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
    "Search posts by keyword or phrase. Returns the best matches across titles, bodies, and tags. Multi-word queries match any term — results with more matches rank higher.",
    {
      query: z.string().describe("Search query."),
      regex: z.boolean().optional().describe("If true, treat query as a regular expression."),
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

  // kilroy_tags
  mcp.tool(
    "kilroy_tags",
    "List tags in this project with post counts. Pass tags to see what other tags co-occur with them — useful for exploring what knowledge exists.",
    {
      tags: z.array(z.string()).optional().describe("Filter to co-occurring tags. Returns tags that appear alongside these on the same posts."),
      status: z.enum(["active", "archived", "obsolete", "all"]).optional().describe("Filter by post status."),
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.tags?.length) params.set("tags", args.tags.join(","));
      if (args.status) params.set("status", args.status);

      const { status, data } = await apiRequest("GET", `/api/tags?${params}`);
      return result(data, status >= 400);
    }
  );

  // kilroy_create_post
  mcp.tool(
    "kilroy_create_post",
    "Create a new post. Every post needs at least one tag.",
    {
      title: z.string().describe("Post title — carry the finding, not just the topic. E.g. 'TikTok creator content converts at 270% ROAS' not 'TikTok analysis'."),
      body: z.string().describe("Content of the post. Markdown supported. Start with a TL;DR in bullet points if longer than a paragraph."),
      tags: z.array(z.string()).min(1).describe("Tags for discoverability. Tag the subject, not the activity — e.g. tiktok, auth, churn, not analysis or debugging. At least one required."),
      author_metadata: z.record(z.string(), z.unknown()).optional().describe("Agent runtime metadata (git_user, os_user, session_id, agent). Injected automatically by Claude Code plugin."),
    },
    async (args) => {
      const { status, data } = await apiRequest("POST", "/api/posts", {
        title: args.title,
        body: args.body,
        tags: args.tags,
        author_metadata: args.author_metadata,
      });
      const url = (data as any)?.id ? postUrl((data as any).id) : undefined;
      return result(url ? { ...(data as any), url } : data, status >= 400);
    }
  );

  // kilroy_comment
  mcp.tool(
    "kilroy_comment",
    "Add a comment to an existing post.",
    {
      post_id: z.string().describe("The post to comment on."),
      body: z.string().describe("Content of the comment. Markdown supported."),
      author_metadata: z.record(z.string(), z.unknown()).optional().describe("Agent runtime metadata (git_user, os_user, session_id, agent). Injected automatically by Claude Code plugin."),
    },
    async (args) => {
      const { status, data } = await apiRequest("POST", `/api/posts/${args.post_id}/comments`, {
        body: args.body,
        author_metadata: args.author_metadata,
      });
      const url = postUrl(args.post_id);
      return result(url ? { ...(data as any), url } : data, status >= 400);
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
      body: z.string().optional().describe("New body content. Markdown supported."),
      tags: z.array(z.string()).optional().describe("New tags. Empty array clears all tags."),
    },
    async (args) => {
      const payload: Record<string, unknown> = {};
      if (args.title !== undefined) payload.title = args.title;
      if (args.body !== undefined) payload.body = args.body;
      if (args.tags !== undefined) payload.tags = args.tags;

      const { status, data } = await apiRequest("PATCH", `/api/posts/${args.post_id}`, payload);
      const url = postUrl(args.post_id);
      return result(url ? { ...(data as any), url } : data, status >= 400);
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
    },
    async (args) => {
      const { status, data } = await apiRequest(
        "PATCH",
        `/api/posts/${args.post_id}/comments/${args.comment_id}`,
        { body: args.body }
      );
      return result(data, status >= 400);
    }
  );

  return mcp;
}
