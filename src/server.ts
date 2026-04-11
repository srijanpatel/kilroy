import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { initDatabase } from "./db";
import { api } from "./routes/api";
import { globalApi } from "./routes/global-api";
import { joinHandler } from "./routes/join";
import { installHandler, universalInstallHandler } from "./routes/install";
import { tokenHandler } from "./routes/token";
import { projectAuth } from "./middleware/project";
import { resolveSession } from "./middleware/auth";
import { statsRouter } from "./routes/stats";
import { auth } from "./auth";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { createMcpServer } from "./mcp/server";
import { getBaseUrl } from "./lib/url";
import { getProjectByAuthUserId } from "./members/registry";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Context } from "hono";
import type { Env } from "./types";

await initDatabase();

const app = new Hono();
const viteDevUrl = process.env.KILROY_WEB_DEV_URL?.replace(/\/$/, "");

function isBackendRoute(path: string): boolean {
  if (path === "/mcp") return true;
  if (path === "/install") return true;
  if (path.startsWith("/api/")) return true;
  return /^\/[^/]+\/[^/]+\/(api|mcp|install|join)(\/|$)/.test(path);
}

async function proxyToVite(c: Context, baseUrl: string): Promise<Response> {
  const incomingUrl = new URL(c.req.url);
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, `${baseUrl}/`);

  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Forwarded-By", "kilroy");

  try {
    return await fetch(
      new Request(targetUrl, {
        method: c.req.method,
        headers,
        body: c.req.raw.body,
      }),
    );
  } catch (error) {
    console.error("Failed to reach Vite dev server", error);
    return c.text(`Vite dev server unavailable at ${baseUrl}`, 502);
  }
}

if (viteDevUrl) {
  app.use(async (c, next) => {
    if (c.req.header("X-Forwarded-By") === "kilroy") return next();
    if ((c.req.method === "GET" || c.req.method === "HEAD") && !isBackendRoute(c.req.path)) {
      return proxyToVite(c, viteDevUrl);
    }
    await next();
  });
}

// Serve web UI static assets
const webDistPath = resolve(import.meta.dir, "../web/dist");
const indexHtml = existsSync(webDistPath)
  ? readFileSync(resolve(webDistPath, "index.html"), "utf-8")
  : null;

if (!viteDevUrl && indexHtml) {
  // Root-level assets (JS/CSS bundles)
  app.use("/assets/*", serveStatic({ root: webDistPath }));

  // Favicon
  app.use("/kilroy.svg", serveStatic({ root: webDistPath, path: "kilroy.svg" }));

  // Landing page — SPA shell at root
  app.get("/", (c) => c.html(indexHtml));
}

// OAuth 2.1 metadata (must be at root per RFC 8414)
const oauthMetadata = oauthProviderAuthServerMetadata(auth);
app.get("/.well-known/oauth-authorization-server", (c) => oauthMetadata(c.req.raw));
app.get("/.well-known/oauth-authorization-server/*", (c) => oauthMetadata(c.req.raw));

// Better Auth handles all auth routes
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// Global stats — public, no auth
app.route("/api/stats", statsRouter);

// Global API — session-authed via resolveSession
app.use("/api/*", resolveSession);
app.route("/api", globalApi);

// SPA pages for web UI
if (!viteDevUrl && indexHtml) {
  app.get("/login", (c) => c.html(indexHtml));
  app.get("/onboarding", (c) => c.html(indexHtml));
  app.get("/projects", (c) => c.html(indexHtml));
  app.get("/consent", (c) => c.html(indexHtml));
}

// OAuth 2.1 protected resource metadata (for root /mcp endpoint)
app.get("/.well-known/oauth-protected-resource", (c) => {
  const baseUrl = getBaseUrl(c.req.url);
  return c.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [`${baseUrl}/api/auth`],
    bearer_methods_supported: ["header"],
  });
});

app.get("/mcp/.well-known/oauth-protected-resource", (c) => {
  const baseUrl = getBaseUrl(c.req.url);
  return c.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [`${baseUrl}/api/auth`],
    bearer_methods_supported: ["header"],
  });
});

// Root-level MCP endpoint — JWT auth via OAuth provider
const resourceClient = oauthProviderResourceClient(auth);
const { verifyAccessToken } = resourceClient.getActions();

app.post("/mcp", async (c) => {
  const baseUrl = getBaseUrl(c.req.url);

  // Extract Bearer token
  const authorization = c.req.header("Authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return c.text("Unauthorized", 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
    });
  }

  // Verify the JWT
  let payload;
  try {
    payload = await verifyAccessToken(accessToken, {
      verifyOptions: { audience: baseUrl },
    });
  } catch {
    return c.text("Unauthorized", 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
    });
  }

  // Read project info from JWT claims
  const projectId = payload.projectId as string | undefined;
  const accountSlug = payload.accountSlug as string | undefined;
  const projectSlug = payload.projectSlug as string | undefined;
  const sub = payload.sub as string | undefined;

  if (!projectId || !accountSlug || !projectSlug || !sub) {
    return c.text("Missing project claims in token", 403);
  }

  // Verify membership
  const membership = await getProjectByAuthUserId(sub, projectId);
  if (!membership) {
    return c.text("Not a member of this project", 403);
  }

  // Create MCP server scoped to the project
  const projectUrl = `${baseUrl}/${accountSlug}/${projectSlug}`;
  const mcp = createMcpServer(projectId, membership.memberAccountId, "agent", projectUrl);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  const response = await transport.handleRequest(c.req.raw);
  return response;
});

// Universal install — no project, no token
app.route("/install", universalInstallHandler);

// Project-scoped routes
const projectApp = new Hono<Env>();

// Install bypasses projectAuth — key in query IS the auth
projectApp.route("/install", installHandler);

// Token exchange bypasses projectAuth — member key in body IS the auth
projectApp.route("/api/token", tokenHandler);

// Join API bypasses projectAuth — invite token IS the auth
projectApp.route("/api/join", joinHandler);

// projectAuth middleware for remaining API and MCP
projectApp.use("/api/*", projectAuth);
projectApp.use("/mcp", projectAuth);

// Project API routes
projectApp.route("/api", api);

// MCP endpoint — stateless streamable HTTP transport
projectApp.all("/mcp", async (c) => {
  const projectId = c.get("projectId");
  const memberAccountId = c.get("memberAccountId");
  const authorType = c.get("authorType");
  const accountSlug = c.get("accountSlug");
  const projectSlug = c.get("projectSlug");
  const baseUrl = getBaseUrl(c.req.url);
  const projectUrl = `${baseUrl}/${accountSlug}/${projectSlug}`;
  const mcp = createMcpServer(projectId, memberAccountId, authorType, projectUrl);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  const response = await transport.handleRequest(c.req.raw);
  return response;
});

// Project-level static assets and SPA fallback
if (!viteDevUrl && indexHtml) {
  projectApp.use("/assets/*", serveStatic({ root: webDistPath, rewriteRequestPath: (p) => p.replace(/^\/[^/]+\/[^/]+/, "") }));
  projectApp.get("*", (c) => c.html(indexHtml));
}

// Mount project routes under /:account/:project
app.route("/:account/:project", projectApp);

const port = parseInt(process.env.KILROY_PORT || "7432");
console.log(`Kilroy server running on http://localhost:${port}`);
export default { port, fetch: app.fetch };
