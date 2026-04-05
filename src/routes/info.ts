import { Hono } from "hono";
import { getWorkspaceProjectKey } from "../workspaces/registry";
import { getBaseUrl } from "../lib/url";
import type { Env } from "../types";

export const infoRouter = new Hono<Env>();

infoRouter.get("/", async (c) => {
  const workspaceId = c.get("workspaceId");
  const workspaceSlug = c.get("workspaceSlug");

  const projectKey = await getWorkspaceProjectKey(workspaceId);
  if (!projectKey) {
    return c.json({ error: "Workspace not found", code: "NOT_FOUND" }, 404);
  }

  const baseUrl = getBaseUrl(c.req.url);
  const workspaceUrl = `${baseUrl}/${workspaceSlug}`;

  return c.json({
    slug: workspaceSlug,
    install_command: `curl -sL "${workspaceUrl}/install?token=${projectKey}" | sh`,
    join_link: `${workspaceUrl}/join?token=${projectKey}`,
  });
});
