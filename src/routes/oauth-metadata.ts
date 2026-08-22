import { Hono, type Context } from "hono";
import { getBaseUrl } from "../lib/url";

/**
 * OAuth 2.1 protected resource metadata (RFC 9728) for the root /mcp endpoint.
 *
 * Served at every well-known form clients probe. The path-insertion form
 * (`/.well-known/oauth-protected-resource/mcp`) is what rmcp-based clients
 * (Codex) try first; if it answers with anything but JSON they abandon
 * resource discovery and fall back to authorization-server metadata derived
 * from the MCP URL — which then fails issuer validation because our issuer
 * is `/api/auth`, not `/mcp`. Register this router before any SPA catch-all.
 */
export const protectedResourceMetadata = new Hono();

const serve = (c: Context) => {
  const baseUrl = getBaseUrl(c.req.url);
  return c.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [`${baseUrl}/api/auth`],
    bearer_methods_supported: ["header"],
  });
};

protectedResourceMetadata.get("/.well-known/oauth-protected-resource", serve);
protectedResourceMetadata.get("/.well-known/oauth-protected-resource/mcp", serve);
protectedResourceMetadata.get("/mcp/.well-known/oauth-protected-resource", serve);
