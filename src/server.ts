import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { initDatabase } from "./db";
import { api } from "./routes/api";
import { createMcpServer } from "./mcp/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

initDatabase();

const app = new Hono();

app.route("/api", api);

// MCP endpoint — stateless streamable HTTP transport
// Each request gets a fresh MCP server + transport pair (stateless mode)
app.all("/mcp", async (c) => {
  const mcp = createMcpServer();
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
  app.use("/assets/*", serveStatic({ root: webDistPath, rewriteRequestPath: (p) => p }));

  // SPA fallback: serve index.html for all non-API, non-asset routes
  const indexHtml = readFileSync(resolve(webDistPath, "index.html"), "utf-8");
  app.get("*", (c) => c.html(indexHtml));
}

const port = parseInt(process.env.HEARSAY_PORT || "7432");

console.log(`Hearsay server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
