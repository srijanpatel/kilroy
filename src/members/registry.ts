import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { projectMembers, projects, accounts } from "../db/schema";
import { uuidv7 } from "../lib/uuid";

function generateMemberKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `klry_proj_${hex}`;
}

export async function addMember(
  projectId: string,
  accountId: string,
  role: "owner" | "member"
): Promise<{ id: string; memberKey: string; role: string }> {
  const id = uuidv7();
  const memberKey = generateMemberKey();

  await db.insert(projectMembers).values({
    id,
    projectId,
    accountId,
    memberKey,
    role,
  });

  return { id, memberKey, role };
}

export async function removeMember(
  projectId: string,
  accountId: string
): Promise<boolean> {
  const result = await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.accountId, accountId)
      )
    )
    .returning();

  return result.length > 0;
}

export async function listMembers(projectId: string) {
  return db
    .select({
      id: projectMembers.id,
      accountId: projectMembers.accountId,
      role: projectMembers.role,
      memberKey: projectMembers.memberKey,
      createdAt: projectMembers.createdAt,
      slug: accounts.slug,
      displayName: accounts.displayName,
    })
    .from(projectMembers)
    .innerJoin(accounts, eq(projectMembers.accountId, accounts.id))
    .where(eq(projectMembers.projectId, projectId));
}

export async function validateMemberKey(
  accountSlug: string,
  projectSlug: string,
  key: string
): Promise<
  | { valid: true; projectId: string; memberAccountId: string }
  | { valid: false }
> {
  const rows = await db
    .select({
      projectId: projectMembers.projectId,
      memberAccountId: projectMembers.accountId,
      memberKey: projectMembers.memberKey,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .innerJoin(accounts, eq(projects.accountId, accounts.id))
    .where(
      and(
        eq(accounts.slug, accountSlug),
        eq(projects.slug, projectSlug),
        eq(projectMembers.memberKey, key)
      )
    );

  if (rows.length === 0) return { valid: false };

  return {
    valid: true,
    projectId: rows[0].projectId,
    memberAccountId: rows[0].memberAccountId,
  };
}

export async function getMemberByAccountAndProject(
  projectId: string,
  accountId: string
) {
  const [row] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.accountId, accountId)
      )
    );

  return row ?? null;
}

export async function regenerateMemberKey(
  projectId: string,
  accountId: string
): Promise<string | null> {
  const newKey = generateMemberKey();

  const result = await db
    .update(projectMembers)
    .set({ memberKey: newKey })
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.accountId, accountId)
      )
    )
    .returning();

  if (result.length === 0) return null;
  return newKey;
}

export async function getMemberKey(
  projectId: string,
  accountId: string
): Promise<string | null> {
  const [row] = await db
    .select({ memberKey: projectMembers.memberKey })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.accountId, accountId)
      )
    );

  return row?.memberKey ?? null;
}

export async function getProjectByAuthUserId(authUserId: string, projectId: string) {
  const rows = await db
    .select({
      projectId: projectMembers.projectId,
      memberAccountId: projectMembers.accountId,
      accountSlug: accounts.slug,
      projectSlug: projects.slug,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .innerJoin(accounts, eq(projects.accountId, accounts.id))
    .where(
      and(
        eq(accounts.authUserId, authUserId),
        eq(projectMembers.projectId, projectId)
      )
    );

  if (rows.length === 0) return null;
  return rows[0];
}

export async function listMembershipsForAccount(accountId: string) {
  return db
    .select({
      projectId: projects.id,
      projectSlug: projects.slug,
      ownerSlug: accounts.slug,
      joinedAt: projectMembers.createdAt,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .innerJoin(accounts, eq(projects.accountId, accounts.id))
    .where(
      and(
        eq(projectMembers.accountId, accountId),
        eq(projectMembers.role, "member")
      )
    );
}
