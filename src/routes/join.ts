import { Hono } from "hono";
import { validateInviteToken } from "../projects/registry";
import { addMember, getMemberByAccountAndProject } from "../members/registry";
import { getAccountByAuthUserId } from "../accounts/registry";
import { auth } from "../auth";
import { getBaseUrl } from "../lib/url";

export const joinHandler = new Hono();

joinHandler.get("/", async (c) => {
  const url = new URL(c.req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const accountSlug = segments[0];
  const projectSlug = segments[1];
  const token = c.req.query("token");

  if (!token) {
    return c.json(
      { error: "Missing required parameter: token", code: "INVALID_INPUT" },
      400
    );
  }

  const result = await validateInviteToken(accountSlug, projectSlug, token);
  if (!result.valid) {
    return c.json(
      { error: "Invalid or expired invite link", code: "UNAUTHORIZED" },
      401
    );
  }

  // Check if user has a session (browser visit)
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) {
    // No session — return JSON for API consumers
    // Browser users will be redirected by the frontend
    const baseUrl = getBaseUrl(c.req.url);
    const projectUrl = `${baseUrl}/${accountSlug}/${projectSlug}`;
    return c.json({
      account: accountSlug,
      project: projectSlug,
      project_url: projectUrl,
      requires_login: true,
    });
  }

  // User is signed in — resolve their account
  const account = await getAccountByAuthUserId(session.user.id);
  if (!account) {
    return c.json({
      account: accountSlug,
      project: projectSlug,
      requires_onboarding: true,
    });
  }

  // Check if already a member
  const existing = await getMemberByAccountAndProject(result.projectId, account.id);
  if (existing) {
    const baseUrl = getBaseUrl(c.req.url);
    const projectUrl = `${baseUrl}/${accountSlug}/${projectSlug}`;
    return c.json({
      account: accountSlug,
      project: projectSlug,
      project_url: projectUrl,
      already_member: true,
      member_key: existing.memberKey,
      install_command: `curl -sL "${projectUrl}/install" | sh`,
    });
  }

  // Create membership
  const member = await addMember(result.projectId, account.id, "member");
  const baseUrl = getBaseUrl(c.req.url);
  const projectUrl = `${baseUrl}/${accountSlug}/${projectSlug}`;

  return c.json({
    account: accountSlug,
    project: projectSlug,
    project_url: projectUrl,
    joined: true,
    member_key: member.memberKey,
    install_command: `curl -sL "${projectUrl}/install" | sh`,
  });
});
