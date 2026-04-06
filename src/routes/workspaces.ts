import { Hono } from "hono";
import { createWorkspace, validateSlug, validateKey } from "../workspaces/registry";
import { getBaseUrl } from "../lib/url";
import type { Env } from "../types";

export const workspacesRouter = new Hono();

// POST /workspaces — Create a new workspace
workspacesRouter.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.slug) {
    return c.json(
      { error: "Missing required field: slug", code: "INVALID_INPUT" },
      400
    );
  }

  const validation = validateSlug(body.slug);
  if (!validation.valid) {
    return c.json({ error: validation.error, code: "INVALID_INPUT" }, 400);
  }

  try {
    const workspace = await createWorkspace(body.slug);
    const baseUrl = getBaseUrl(c.req.url);

    return c.json(
      {
        slug: workspace.slug,
        project_key: workspace.projectKey,
        join_url: `${baseUrl}/${workspace.slug}/_/join?token=${workspace.projectKey}`,
        workspace_url: `${baseUrl}/${workspace.slug}`,
      },
      201
    );
  } catch (err: any) {
    if (err.message?.includes("already exists")) {
      return c.json(
        { error: err.message, code: "SLUG_TAKEN" },
        409
      );
    }
    throw err;
  }
});

// GET /_/api/join — Validate token, set session cookie, return setup info
// Mounted before auth middleware so the token itself is the auth.
export const joinApiHandler = new Hono<Env>();

joinApiHandler.get("/", async (c) => {
  // Extract workspace slug from URL path — this handler is mounted at /:workspace/_/api/join
  // but Hono child routers don't inherit parent route params, and auth middleware
  // (which sets workspaceSlug) is intentionally bypassed for this endpoint.
  const url = new URL(c.req.url);
  const slug = url.pathname.split("/")[1];
  const token = c.req.query("token");

  if (!token) {
    return c.json(
      { error: "Missing required parameter: token", code: "INVALID_INPUT" },
      400
    );
  }

  const result = await validateKey(slug, token);
  if (!result.valid) {
    return c.json(
      { error: "Invalid project key", code: "UNAUTHORIZED" },
      401
    );
  }

  const isSecure = c.req.url.startsWith("https");
  const maxAge = 90 * 24 * 60 * 60; // 90 days in seconds

  const cookieValue = encodeURIComponent(token);
  let cookie = `klry_session=${cookieValue}; Path=/${slug}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
  if (isSecure) {
    cookie += "; Secure";
  }

  c.header("Set-Cookie", cookie);

  const baseUrl = getBaseUrl(c.req.url);
  const workspaceUrl = `${baseUrl}/${slug}`;
  return c.json({
    workspace: slug,
    workspace_url: workspaceUrl,
    install_command: `curl -sL "${workspaceUrl}/_/install?token=${token}" | sh`,
  });
});
