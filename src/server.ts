import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { initDatabase } from "./db";
import { api } from "./routes/api";
import { globalApi } from "./routes/global-api";
import { joinHandler } from "./routes/join";
import { installHandler, universalInstallHandler } from "./routes/install";
import { tokenHandler } from "./routes/token";
import { publicPostsRouter } from "./routes/public-posts";
import { projectAuth } from "./middleware/project";
import { resolveSession } from "./middleware/auth";
import { statsRouter } from "./routes/stats";
import { auth } from "./auth";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { createMcpServer } from "./mcp/server";
import { getBaseUrl } from "./lib/url";
import { getAccountById } from "./accounts/registry";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Context } from "hono";
import type { Auth as BetterAuthInstance } from "better-auth/types";
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

  // Favicon + OG image
  app.use("/kilroy.svg", serveStatic({ root: webDistPath, path: "kilroy.svg" }));
  app.use("/og.png", serveStatic({ root: webDistPath, path: "og.png" }));

  // Landing page — SPA shell at root
  app.get("/", (c) => c.html(indexHtml));
  app.get("/share/:token", (c) => c.html(indexHtml));
}

// OAuth 2.1 metadata (must be at root per RFC 8414)
// Better Auth's oauth-provider omits `resource_indicators_supported` from its
// metadata even though it accepts the `resource` parameter and issues JWTs
// when given one. Spec-compliant clients (Codex) only send `resource=` when
// the server advertises support — without it they get opaque tokens that our
// /mcp handler can't verify locally. We patch the flag in here.
const oauthMetadata = oauthProviderAuthServerMetadata(auth);
const serveAuthServerMetadata = async (c: Context) => {
  const upstream = await oauthMetadata(c.req.raw);
  const body = (await upstream.json()) as Record<string, unknown>;
  return c.json(
    { ...body, resource_indicators_supported: true },
    200,
    {
      "Cache-Control":
        upstream.headers.get("Cache-Control") ??
        "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
    },
  );
};
app.get("/.well-known/oauth-authorization-server", serveAuthServerMetadata);
app.get("/.well-known/oauth-authorization-server/*", serveAuthServerMetadata);

// Codex (and other current MCP clients) don't honor `resource_indicators_supported`
// — they never send a `resource=` parameter in the /oauth2/token request, so
// better-auth issues opaque access tokens that /mcp can't verify locally.
// We inject `resource=<baseUrl>/mcp` into the form body when missing so every
// token exchange produces a JWT. Safe because our `validAudiences` already
// includes that URL. Remove when MCP clients become RFC 8707-compliant.
app.post("/api/auth/oauth2/token", async (c) => {
  const contentType = c.req.header("Content-Type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return auth.handler(c.req.raw);
  }
  const bodyText = await c.req.text();
  const params = new URLSearchParams(bodyText);
  if (!params.has("resource")) {
    // Must match an entry in auth.ts `validAudiences` — use the configured
    // BETTER_AUTH_URL so this works regardless of how the request arrived
    // (localhost, proxy, direct). Strip any trailing slash so the resulting
    // `${authBase}/mcp` doesn't become `...//mcp` and fall outside validAudiences.
    const authBase = (process.env.BETTER_AUTH_URL ?? getBaseUrl(c.req.url)).replace(/\/$/, "");
    params.set("resource", `${authBase}/mcp`);
  }
  const headers = new Headers(c.req.raw.headers);
  headers.delete("content-length");
  return auth.handler(
    new Request(c.req.raw.url, {
      method: "POST",
      headers,
      body: params.toString(),
    }),
  );
});

// Better Auth handles all other auth routes
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// Global stats — public, no auth
app.route("/api/stats", statsRouter);
app.route("/api/public", publicPostsRouter);

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
const resourceClient = oauthProviderResourceClient(
  auth as unknown as BetterAuthInstance,
);
const { verifyAccessToken } = resourceClient.getActions();

app.post("/mcp", async (c) => {
  const baseUrl = getBaseUrl(c.req.url);

  const authorization = c.req.header("Authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return c.text("Unauthorized", 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
    });
  }

  let payload;
  try {
    payload = await verifyAccessToken(accessToken, {
      jwksUrl: `${baseUrl}/api/auth/jwks`,
      verifyOptions: { issuer: `${baseUrl}/api/auth`, audience: `${baseUrl}/mcp` },
    });
  } catch {
    return c.text("Unauthorized", 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
    });
  }

  const sub = payload.sub as string | undefined;
  if (!sub) {
    return c.text("Missing user identity in token", 403);
  }

  const mcp = createMcpServer(sub, "agent", baseUrl);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  return await transport.handleRequest(c.req.raw);
});

// Universal install — no project, no token
app.route("/install", universalInstallHandler);

// Project-scoped routes
const projectApp = new Hono<Env>();

// Install is public — no auth needed, OAuth handles it at runtime
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
  const memberAccountId = c.get("memberAccountId");
  const authorType = c.get("authorType");
  const baseUrl = getBaseUrl(c.req.url);

  // Resolve app-level account ID to Better Auth user ID
  const account = await getAccountById(memberAccountId);
  if (!account) {
    return c.text("Account not found", 403);
  }

  const mcp = createMcpServer(account.authUserId, authorType, baseUrl);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  return await transport.handleRequest(c.req.raw);
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
