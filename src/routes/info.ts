import { Hono } from "hono";
import { getProjectInviteToken } from "../projects/registry";
import { getMemberKey } from "../members/registry";
import { getBaseUrl } from "../lib/url";
import type { Env } from "../types";

export const infoRouter = new Hono<Env>();

infoRouter.get("/", async (c) => {
  const projectId = c.get("projectId");
  const projectSlug = c.get("projectSlug");
  const accountSlug = c.get("accountSlug");
  const memberAccountId = c.get("memberAccountId");

  const memberKey = await getMemberKey(projectId, memberAccountId);
  if (!memberKey) {
    return c.json({ error: "Member not found", code: "NOT_FOUND" }, 404);
  }

  const inviteToken = await getProjectInviteToken(projectId);
  const baseUrl = getBaseUrl(c.req.url);
  const projectUrl = `${baseUrl}/${accountSlug}/${projectSlug}`;

  return c.json({
    account: accountSlug,
    project: projectSlug,
    project_id: projectId,
    member_key: memberKey,
    install_command: `curl -sL "${projectUrl}/install" | sh`,
    invite_link: inviteToken ? `${projectUrl}/join?token=${inviteToken}` : null,
  });
});
