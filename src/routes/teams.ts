import { Hono } from "hono";
import { createTeam, validateSlug, validateKey } from "../teams/registry";
import { getBaseUrl } from "../lib/url";
import type { Env } from "../types";

export const teamsRouter = new Hono();

// POST /teams — Create a new team
teamsRouter.post("/", async (c) => {
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
    const team = await createTeam(body.slug);
    const baseUrl = getBaseUrl(c.req.url);

    return c.json(
      {
        slug: team.slug,
        project_key: team.projectKey,
        join_url: `${baseUrl}/${team.slug}/join?token=${team.projectKey}`,
        team_url: `${baseUrl}/${team.slug}`,
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

// GET /api/join — Validate token, set session cookie, return setup info
// Mounted before auth middleware so the token itself is the auth.
export const joinApiHandler = new Hono<Env>();

joinApiHandler.get("/", async (c) => {
  // Extract team slug from URL path — this handler is mounted at /:team/api/join
  // but Hono child routers don't inherit parent route params, and auth middleware
  // (which sets teamSlug) is intentionally bypassed for this endpoint.
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
  const teamUrl = `${baseUrl}/${slug}`;
  return c.json({
    team: slug,
    team_url: teamUrl,
    install_command: `curl -sL "${teamUrl}/install?token=${token}" | sh`,
  });
});
