import { Hono } from "hono";
import { getTeamProjectKey } from "../teams/registry";
import type { Env } from "../types";

export const infoRouter = new Hono<Env>();

infoRouter.get("/", async (c) => {
  const teamId = c.get("teamId");
  const teamSlug = c.get("teamSlug");

  const projectKey = await getTeamProjectKey(teamId);
  if (!projectKey) {
    return c.json({ error: "Team not found", code: "NOT_FOUND" }, 404);
  }

  const baseUrl = new URL(c.req.url).origin;
  const teamUrl = `${baseUrl}/${teamSlug}`;

  return c.json({
    slug: teamSlug,
    setup_commands: [
      `/plugin marketplace add srijanpatel/kilroy`,
      `/plugin install kilroy@kilroy-marketplace`,
      `/kilroy-setup ${teamUrl} ${projectKey}`,
    ],
    join_link: `${teamUrl}/join?token=${projectKey}`,
  });
});
