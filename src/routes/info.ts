import { Hono } from "hono";
import { getTeamProjectKey } from "../teams/registry";
import { getBaseUrl } from "../lib/url";
import type { Env } from "../types";

export const infoRouter = new Hono<Env>();

infoRouter.get("/", async (c) => {
  const teamId = c.get("teamId");
  const teamSlug = c.get("teamSlug");

  const projectKey = await getTeamProjectKey(teamId);
  if (!projectKey) {
    return c.json({ error: "Team not found", code: "NOT_FOUND" }, 404);
  }

  const baseUrl = getBaseUrl(c.req.url);
  const teamUrl = `${baseUrl}/${teamSlug}`;

  return c.json({
    slug: teamSlug,
    install_command: `curl -sL "${teamUrl}/install?token=${projectKey}" | sh`,
    join_link: `${teamUrl}/join?token=${projectKey}`,
  });
});
