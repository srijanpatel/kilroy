import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api } from "../routes/api";
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveProject } from "./resolve-project";
import { listProjectsForAuthUser, createProjectForAuthUser } from "../members/registry";

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

const projectParam = z.string().describe("Project in account/slug format (e.g. srijan/sagaland)");

export function createMcpServer(authUserId: string, authorType: "human" | "agent", baseUrl: string) {
  async function withProject<T>(
    project: string,
    fn: (apiRequest: ReturnType<typeof createApiRequest>, projectUrl: string) => Promise<T>,
  ): Promise<T> {
    const resolved = await resolveProject(authUserId, project);
    const apiRequest = createApiRequest(resolved.projectId, resolved.memberAccountId, authorType);
    const projectUrl = `${baseUrl}/${resolved.accountSlug}/${resolved.projectSlug}`;
    return fn(apiRequest, projectUrl);
  }

  const mcp = new McpServer(
    { name: "kilroy", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  mcp.registerTool(
    "kilroy_list_projects",
    { description: "List projects you have access to." },
    async () => {
      try {
        const projects = await listProjectsForAuthUser(authUserId);
        return result(projects);
      } catch (err: any) {
        return result({ error: err.message }, true);
      }
    }
  );

  mcp.registerTool(
    "kilroy_create_project",
    {
      description: "Create a new Kilroy project.",
      inputSchema: {
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/).describe("Project slug (3-40 chars, lowercase, hyphens)"),
      },
    },
    async (params) => {
      try {
        const project = await createProjectForAuthUser(authUserId, params.slug);
        return result(project);
      } catch (err: any) {
        return result({ error: err.message }, true);
      }
    }
  );

  mcp.registerTool(
    "kilroy_read_post",
    {
      description: "Read a post and all its comments.",
      inputSchema: {
        project: projectParam,
        post_id: z.string().describe("The post's UUID v7."),
      },
    },
    async (args) => {
      try {
        return await withProject(args.project, async (app, projectUrl) => {
          const { status, data } = await app("GET", `/api/posts/${args.post_id}`);
          return result(data, status >= 400);
        });
      } catch (err: any) {
        return result({ error: err.message }, true);
      }
    }
  );

  mcp.registerTool(
    "kilroy_search",
    {
      description: "Search posts by keyword or phrase, or browse recent posts. When called with a query, returns the best matches across titles, bodies, and tags. When called without a query, returns recent posts sorted by date — use this to see what's new.",
      inputSchema: {
        project: projectParam,
        query: z.string().optional().describe("Search query. Omit to browse recent posts."),
        regex: z.boolean().optional().describe("If true, treat query as a regular expression."),
        tags: z.array(z.string()).optional().describe("Only search posts that have all of these tags."),
        status: z.enum(["active", "archived", "obsolete", "all"]).optional().describe("Filter by status."),
        order_by: z.enum(["relevance", "updated_at", "created_at"]).optional().describe("Sort field."),
        order: z.enum(["asc", "desc"]).optional().describe("Sort direction."),
        cursor: z.string().optional().describe("Pagination cursor from a previous response."),
        limit: z.number().int().min(1).max(100).optional().describe("Maximum number of results to return (1-100)."),
      },
    },
    async (args) => {
      try {
        return await withProject(args.project, async (app, projectUrl) => {
          const params = new URLSearchParams();
          if (args.query) params.set("query", args.query);
          if (args.regex !== undefined) params.set("regex", String(args.regex));
          if (args.tags?.length) params.set("tags", args.tags.join(","));
          if (args.status) params.set("status", args.status);
          if (args.order_by) params.set("order_by", args.order_by);
          if (args.order) params.set("order", args.order);
          if (args.cursor) params.set("cursor", args.cursor);
          if (args.limit !== undefined) params.set("limit", String(args.limit));

          const { status, data } = await app("GET", `/api/search?${params}`);
          return result(data, status >= 400);
        });
      } catch (err: any) {
        return result({ error: err.message }, true);
      }
    }
  );

  mcp.registerTool(
    "kilroy_tags",
    {
      description: "List tags in this project with post counts. Pass tags to see what other tags co-occur with them — useful for exploring what knowledge exists.",
      inputSchema: {
        project: projectParam,
        tags: z.array(z.string()).optional().describe("Filter to co-occurring tags. Returns tags that appear alongside these on the same posts."),
        status: z.enum(["active", "archived", "obsolete", "all"]).optional().describe("Filter by post status."),
      },
    },
    async (args) => {
      try {
        return await withProject(args.project, async (app, projectUrl) => {
          const params = new URLSearchParams();
          if (args.tags?.length) params.set("tags", args.tags.join(","));
          if (args.status) params.set("status", args.status);

          const { status, data } = await app("GET", `/api/tags?${params}`);
          return result(data, status >= 400);
        });
      } catch (err: any) {
        return result({ error: err.message }, true);
      }
    }
  );

  mcp.registerTool(
    "kilroy_create_post",
    {
      description: "Create a new post. Every post needs at least one tag.",
      inputSchema: {
        project: projectParam,
        title: z.string().describe("Post title — carry the finding, not just the topic. E.g. 'TikTok creator content converts at 270% ROAS' not 'TikTok analysis'."),
        body: z.string().describe("Content of the post. Markdown supported. Start with a TL;DR in bullet points if longer than a paragraph."),
        tags: z.array(z.string()).min(1).describe("Tags for discoverability. Tag the subject, not the activity — e.g. tiktok, auth, churn, not analysis or debugging. At least one required."),
        author_metadata: z.record(z.string(), z.unknown()).optional().describe("Agent runtime metadata (git_user, os_user, session_id, agent). Injected automatically by Claude Code plugin."),
      },
    },
    async (args) => {
      try {
        return await withProject(args.project, async (app, projectUrl) => {
          const { status, data } = await app("POST", "/api/posts", {
            title: args.title,
            body: args.body,
            tags: args.tags,
            author_metadata: args.author_metadata,
          });
          const postUrl = (data as any)?.id ? `${projectUrl}/post/${(data as any).id}` : undefined;
          return result(postUrl ? { ...(data as any), url: postUrl } : data, status >= 400);
        });
      } catch (err: any) {
        return result({ error: err.message }, true);
      }
    }
  );

  mcp.registerTool(
    "kilroy_comment",
    {
      description: "Add a comment to an existing post.",
      inputSchema: {
        project: projectParam,
        post_id: z.string().describe("The post to comment on."),
        body: z.string().describe("Content of the comment. Markdown supported."),
        author_metadata: z.record(z.string(), z.unknown()).optional().describe("Agent runtime metadata (git_user, os_user, session_id, agent). Injected automatically by Claude Code plugin."),
      },
    },
    async (args) => {
      try {
        return await withProject(args.project, async (app, projectUrl) => {
          const { status, data } = await app("POST", `/api/posts/${args.post_id}/comments`, {
            body: args.body,
            author_metadata: args.author_metadata,
          });
          const postUrl = `${projectUrl}/post/${args.post_id}`;
          return result({ ...(data as any), url: postUrl }, status >= 400);
        });
      } catch (err: any) {
        return result({ error: err.message }, true);
      }
    }
  );

  mcp.registerTool(
    "kilroy_update_post_status",
    {
      description: "Change a post's status.",
      inputSchema: {
        project: projectParam,
        post_id: z.string().describe("The post to update."),
        status: z.enum(["active", "archived", "obsolete"]).describe("New status."),
      },
    },
    async (args) => {
      try {
        return await withProject(args.project, async (app, projectUrl) => {
          const { status, data } = await app("PATCH", `/api/posts/${args.post_id}`, {
            status: args.status,
          });
          return result(data, status >= 400);
        });
      } catch (err: any) {
        return result({ error: err.message }, true);
      }
    }
  );

  mcp.registerTool(
    "kilroy_delete_post",
    {
      description: "Permanently delete a post and all its comments. This is irreversible.",
      inputSchema: {
        project: projectParam,
        post_id: z.string().describe("The post to delete."),
      },
      annotations: { destructiveHint: true },
    },
    async (args) => {
      try {
        return await withProject(args.project, async (app, projectUrl) => {
          const { status, data } = await app("DELETE", `/api/posts/${args.post_id}`);
          return result(data, status >= 400);
        });
      } catch (err: any) {
        return result({ error: err.message }, true);
      }
    }
  );

  mcp.registerTool(
    "kilroy_update_post",
    {
      description: "Update an existing post's content. You can only edit your own posts.",
      inputSchema: {
        project: projectParam,
        post_id: z.string().describe("The post to update."),
        title: z.string().optional().describe("New title."),
        body: z.string().optional().describe("New body content. Markdown supported."),
        tags: z.array(z.string()).optional().describe("New tags. Empty array clears all tags."),
      },
    },
    async (args) => {
      try {
        return await withProject(args.project, async (app, projectUrl) => {
          const payload: Record<string, unknown> = {};
          if (args.title !== undefined) payload.title = args.title;
          if (args.body !== undefined) payload.body = args.body;
          if (args.tags !== undefined) payload.tags = args.tags;

          const { status, data } = await app("PATCH", `/api/posts/${args.post_id}`, payload);
          const postUrl = `${projectUrl}/post/${args.post_id}`;
          return result({ ...(data as any), url: postUrl }, status >= 400);
        });
      } catch (err: any) {
        return result({ error: err.message }, true);
      }
    }
  );

  mcp.registerTool(
    "kilroy_update_comment",
    {
      description: "Update an existing comment's body. You can only edit your own comments.",
      inputSchema: {
        project: projectParam,
        post_id: z.string().describe("The post the comment belongs to."),
        comment_id: z.string().describe("The comment to update."),
        body: z.string().describe("New comment body. Markdown supported."),
      },
    },
    async (args) => {
      try {
        return await withProject(args.project, async (app, projectUrl) => {
          const { status, data } = await app(
            "PATCH",
            `/api/posts/${args.post_id}/comments/${args.comment_id}`,
            { body: args.body }
          );
          return result(data, status >= 400);
        });
      } catch (err: any) {
        return result({ error: err.message }, true);
      }
    }
  );

  return mcp;
}
