import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { initDatabase } from "./db";
import { api } from "./routes/api";
import { workspacesRouter, joinApiHandler } from "./routes/workspaces";
import { installHandler } from "./routes/install";
import { workspaceAuth } from "./middleware/workspace";
import { statsRouter } from "./routes/stats";
import { createMcpServer } from "./mcp/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Env } from "./types";

await initDatabase();

const app = new Hono();

// Serve web UI static assets at root level (for LandingView) and workspace level
const webDistPath = resolve(import.meta.dir, "../web/dist");
const indexHtml = existsSync(webDistPath)
  ? readFileSync(resolve(webDistPath, "index.html"), "utf-8")
  : null;

if (indexHtml) {
  // Root-level assets (JS/CSS bundles for the landing page)
  app.use("/assets/*", serveStatic({ root: webDistPath }));

  // Favicon
  app.use("/kilroy.svg", serveStatic({ root: webDistPath, path: "kilroy.svg" }));

  // Landing page — SPA shell at root
  app.get("/", (c) => c.html(indexHtml));
}

// Workspace creation — no auth required
app.route("/workspaces", workspacesRouter);

// System namespace — public, no auth
app.route("/_/api", statsRouter);

// Serve SPA for system pages
if (indexHtml) {
  app.get("/_/*", (c) => c.html(indexHtml));
}

// Workspace-scoped routes
const workspaceApp = new Hono<Env>();

// Join API — validates token, sets cookie (before auth middleware — the token IS the auth)
workspaceApp.route("/api/join", joinApiHandler);

// Install script — serves a shell script for one-command setup (no auth — token in query)
workspaceApp.route("/install", installHandler);

// Auth middleware for all other workspace routes
workspaceApp.use("/api/*", workspaceAuth);
workspaceApp.use("/mcp", workspaceAuth);

// API routes
workspaceApp.route("/api", api);

// MCP endpoint — stateless streamable HTTP transport
workspaceApp.all("/mcp", async (c) => {
  const workspaceId = c.get("workspaceId");
  const mcp = createMcpServer(workspaceId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  const response = await transport.handleRequest(c.req.raw);
  return response;
});

// Workspace-level static assets and SPA fallback
if (indexHtml) {
  workspaceApp.use("/assets/*", serveStatic({ root: webDistPath, rewriteRequestPath: (p) => p.replace(/^\/[^/]+/, "") }));
  workspaceApp.get("*", (c) => c.html(indexHtml));
}

// Mount workspace routes under /:workspace
app.route("/:workspace", workspaceApp);

const port = parseInt(process.env.KILROY_PORT || "7432");
console.log(`Kilroy server running on http://localhost:${port}`);
export default { port, fetch: app.fetch };
