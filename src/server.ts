import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { initDatabase } from "./db";
import { api } from "./routes/api";
import { teamsRouter, joinApiHandler } from "./routes/teams";
import { installHandler } from "./routes/install";
import { teamAuth } from "./middleware/team";
import { createMcpServer } from "./mcp/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Env } from "./types";

await initDatabase();

const app = new Hono();

// Serve web UI static assets at root level (for LandingView) and team level
const webDistPath = resolve(import.meta.dir, "../web/dist");
const indexHtml = existsSync(webDistPath)
  ? readFileSync(resolve(webDistPath, "index.html"), "utf-8")
  : null;

if (indexHtml) {
  // Root-level assets (JS/CSS bundles for the landing page)
  app.use("/assets/*", serveStatic({ root: webDistPath }));

  // Landing page — SPA shell at root
  app.get("/", (c) => c.html(indexHtml));
}

// Team creation — no auth required
app.route("/teams", teamsRouter);

// Team-scoped routes
const teamApp = new Hono<Env>();

// Join API — validates token, sets cookie (before auth middleware — the token IS the auth)
teamApp.route("/api/join", joinApiHandler);

// Install script — serves a shell script for one-command setup (no auth — token in query)
teamApp.route("/install", installHandler);

// Auth middleware for all other team routes
teamApp.use("/api/*", teamAuth);
teamApp.use("/mcp", teamAuth);

// API routes
teamApp.route("/api", api);

// MCP endpoint — stateless streamable HTTP transport
teamApp.all("/mcp", async (c) => {
  const teamId = c.get("teamId");
  const mcp = createMcpServer(teamId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  const response = await transport.handleRequest(c.req.raw);
  return response;
});

// Team-level static assets and SPA fallback
if (indexHtml) {
  teamApp.use("/assets/*", serveStatic({ root: webDistPath, rewriteRequestPath: (p) => p.replace(/^\/[^/]+/, "") }));
  teamApp.get("*", (c) => c.html(indexHtml));
}

// Mount team routes under /:team
app.route("/:team", teamApp);

const port = parseInt(process.env.KILROY_PORT || "7432");

console.log(`Kilroy server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
