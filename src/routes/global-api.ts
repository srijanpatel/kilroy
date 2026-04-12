import { Hono } from "hono";
import { createProject, validateProjectSlug, listProjectsByAccount, regenerateInviteToken } from "../projects/registry";
import { listMembershipsForAccount, listMembers, getMemberByAccountAndProject, removeMember, regenerateMemberKey } from "../members/registry";
import { createAccount, validateAccountSlug, suggestSlug } from "../accounts/registry";
import { getBaseUrl } from "../lib/url";

type AuthEnv = {
  Variables: {
    user: { id: string; email: string; name: string } | null;
    account: { id: string; slug: string; displayName: string } | null;
  };
};

export const globalApi = new Hono<AuthEnv>();

// GET /api/account
globalApi.get("/account", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not authenticated", code: "UNAUTHORIZED" }, 401);

  const account = c.get("account");
  if (!account) {
    return c.json({ has_account: false, user: { email: user.email, name: user.name } });
  }

  return c.json({
    has_account: true,
    account: { id: account.id, slug: account.slug, display_name: account.displayName },
  });
});

// POST /api/account
globalApi.post("/account", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not authenticated", code: "UNAUTHORIZED" }, 401);

  const existing = c.get("account");
  if (existing) return c.json({ error: "Account already exists", code: "CONFLICT" }, 409);

  const body = await c.req.json();
  if (!body.slug) return c.json({ error: "Missing slug", code: "INVALID_INPUT" }, 400);

  const validation = validateAccountSlug(body.slug);
  if (!validation.valid) return c.json({ error: validation.error, code: "INVALID_INPUT" }, 400);

  try {
    const account = await createAccount({
      slug: body.slug,
      displayName: body.display_name || user.name || body.slug,
      authUserId: user.id,
    });
    return c.json(account, 201);
  } catch (err: any) {
    if (err.message?.includes("already taken")) {
      return c.json({ error: err.message, code: "SLUG_TAKEN" }, 409);
    }
    throw err;
  }
});

// GET /api/account/slug-suggestion
globalApi.get("/account/slug-suggestion", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not authenticated", code: "UNAUTHORIZED" }, 401);

  const slug = suggestSlug("email", { email: user.email, name: user.name });
  return c.json({ suggestion: slug });
});

// GET /api/projects
globalApi.get("/projects", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const ownedProjects = await listProjectsByAccount(account.id);
  const memberships = await listMembershipsForAccount(account.id);

  return c.json({
    owned: ownedProjects.map((p) => ({
      id: p.id,
      slug: p.slug,
      created_at: p.createdAt.toISOString(),
    })),
    joined: memberships.map((m) => ({
      id: m.projectId,
      slug: m.projectSlug,
      owner: m.ownerSlug,
      joined_at: m.joinedAt.toISOString(),
    })),
  });
});

// POST /api/projects
globalApi.post("/projects", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const body = await c.req.json();
  if (!body.slug) return c.json({ error: "Missing slug", code: "INVALID_INPUT" }, 400);

  const validation = validateProjectSlug(body.slug);
  if (!validation.valid) return c.json({ error: validation.error, code: "INVALID_INPUT" }, 400);

  try {
    const project = await createProject(account.id, body.slug);
    const baseUrl = getBaseUrl(c.req.url);

    return c.json({
      id: project.id,
      slug: project.slug,
      account_slug: account.slug,
      member_key: project.memberKey,
      project_url: `${baseUrl}/${account.slug}/${project.slug}`,
      install_command: `curl -sL "${baseUrl}/${account.slug}/${project.slug}/install" | sh`,
      invite_link: `${baseUrl}/${account.slug}/${project.slug}/join?token=${project.inviteToken}`,
    }, 201);
  } catch (err: any) {
    if (err.message?.includes("already exists")) {
      return c.json({ error: err.message, code: "SLUG_TAKEN" }, 409);
    }
    throw err;
  }
});

// GET /api/projects/:projectId/members
globalApi.get("/projects/:projectId/members", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const projectId = c.req.param("projectId");
  const members = await listMembers(projectId);

  return c.json({
    members: members.map((m) => ({
      account_id: m.accountId,
      slug: m.slug,
      display_name: m.displayName,
      role: m.role,
      joined_at: m.createdAt.toISOString(),
    })),
  });
});

// DELETE /api/projects/:projectId/members/:accountId
globalApi.delete("/projects/:projectId/members/:accountId", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const projectId = c.req.param("projectId");
  const targetAccountId = c.req.param("accountId");

  const requesterMembership = await getMemberByAccountAndProject(projectId, account.id);
  if (!requesterMembership || requesterMembership.role !== "owner") {
    return c.json({ error: "Only the project owner can remove members", code: "FORBIDDEN" }, 403);
  }

  if (targetAccountId === account.id) {
    return c.json({ error: "Owner cannot be removed from their project", code: "FORBIDDEN" }, 403);
  }

  const removed = await removeMember(projectId, targetAccountId);
  if (!removed) {
    return c.json({ error: "Member not found", code: "NOT_FOUND" }, 404);
  }

  return c.json({ removed: true });
});

// POST /api/projects/:projectId/leave
globalApi.post("/projects/:projectId/leave", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const projectId = c.req.param("projectId");
  const membership = await getMemberByAccountAndProject(projectId, account.id);
  if (!membership) {
    return c.json({ error: "Not a member of this project", code: "NOT_FOUND" }, 404);
  }

  if (membership.role === "owner") {
    return c.json({ error: "Owner cannot leave their project", code: "FORBIDDEN" }, 403);
  }

  await removeMember(projectId, account.id);
  return c.json({ left: true });
});

// POST /api/projects/:projectId/regenerate-invite
globalApi.post("/projects/:projectId/regenerate-invite", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const projectId = c.req.param("projectId");
  const membership = await getMemberByAccountAndProject(projectId, account.id);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Only the project owner can regenerate the invite link", code: "FORBIDDEN" }, 403);
  }

  const newToken = await regenerateInviteToken(projectId);

  return c.json({
    invite_token: newToken,
  });
});

// POST /api/projects/:projectId/regenerate-key
globalApi.post("/projects/:projectId/regenerate-key", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const projectId = c.req.param("projectId");
  const newKey = await regenerateMemberKey(projectId, account.id);
  if (!newKey) {
    return c.json({ error: "Member not found", code: "NOT_FOUND" }, 404);
  }

  return c.json({ member_key: newKey });
});
