import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { initDatabase } from "./db";
import { api } from "./routes/api";
import { teamsRouter, joinApiHandler } from "./routes/teams";
import { teamAuth } from "./middleware/team";
import { createMcpServer } from "./mcp/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Env } from "./types";

await initDatabase();

const app = new Hono();

// Team creation — no auth required
app.route("/teams", teamsRouter);

// Team-scoped routes
const teamApp = new Hono<Env>();

// Join API — validates token, sets cookie (before auth middleware — the token IS the auth)
teamApp.route("/api/join", joinApiHandler);

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

// Serve web UI static assets
const webDistPath = resolve(import.meta.dir, "../web/dist");
if (existsSync(webDistPath)) {
  teamApp.use("/assets/*", serveStatic({ root: webDistPath, rewriteRequestPath: (p) => p.replace(/^\/[^/]+/, "") }));

  // SPA fallback: serve index.html for all non-API, non-asset routes
  const indexHtml = readFileSync(resolve(webDistPath, "index.html"), "utf-8");
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
