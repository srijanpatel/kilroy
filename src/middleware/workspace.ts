import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { validateKey, getWorkspaceBySlug } from "../workspaces/registry";

export const workspaceAuth = createMiddleware<Env>(async (c, next) => {
  const slug = c.req.param("workspace");
  if (!slug) {
    return c.json(
      { error: "Missing workspace identifier", code: "BAD_REQUEST" },
      400
    );
  }

  // Try Bearer token from Authorization header (agents, CLI, MCP)
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const result = await validateKey(slug, token);
    if (result.valid) {
      c.set("workspaceId", result.workspaceId);
      c.set("workspaceSlug", slug);
      return next();
    }
  }

  // Try session cookie (web UI)
  const cookie = getCookie(c.req.raw, "klry_session");
  if (cookie) {
    const result = await validateKey(slug, cookie);
    if (result.valid) {
      c.set("workspaceId", result.workspaceId);
      c.set("workspaceSlug", slug);
      return next();
    }
  }

  return c.json(
    { error: "Invalid or missing project key", code: "UNAUTHORIZED" },
    401
  );
});

function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("Cookie");
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
