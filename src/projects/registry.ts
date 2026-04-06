import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { projects, accounts } from "../db/schema";
import { uuidv7 } from "../lib/uuid";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const RESERVED_PROJECT_SLUGS = new Set([
  "api",
  "settings",
  "mcp",
  "join",
  "install",
  "browse",
  "search",
  "post",
  "new",
]);

function generateProjectKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `klry_proj_${hex}`;
}

export function validateProjectSlug(slug: string): { valid: boolean; error?: string } {
  if (!SLUG_PATTERN.test(slug)) {
    return {
      valid: false,
      error: "Slug must be 3-40 characters, lowercase alphanumeric and hyphens, cannot start or end with a hyphen",
    };
  }
  if (RESERVED_PROJECT_SLUGS.has(slug)) {
    return { valid: false, error: `Slug "${slug}" is reserved` };
  }
  return { valid: true };
}

export async function createProject(accountId: string, slug: string): Promise<{
  slug: string;
  id: string;
  projectKey: string;
}> {
  const validation = validateProjectSlug(slug);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const [existing] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.accountId, accountId), eq(projects.slug, slug)));
  if (existing) {
    throw new Error(`Project "${slug}" already exists in this account`);
  }

  const id = uuidv7();
  const projectKey = generateProjectKey();

  await db.insert(projects).values({
    id,
    slug,
    accountId,
    projectKey,
  });

  return { slug, id, projectKey };
}

export async function validateProjectKey(
  accountSlug: string,
  projectSlug: string,
  key: string
): Promise<{ valid: true; projectId: string } | { valid: false }> {
  const rows = await db
    .select({ projectId: projects.id, projectKey: projects.projectKey })
    .from(projects)
    .innerJoin(accounts, eq(projects.accountId, accounts.id))
    .where(and(eq(accounts.slug, accountSlug), eq(projects.slug, projectSlug)));

  if (rows.length === 0) return { valid: false };
  if (key !== rows[0].projectKey) return { valid: false };
  return { valid: true, projectId: rows[0].projectId };
}

export async function getProjectBySlugs(
  accountSlug: string,
  projectSlug: string
): Promise<{ id: string; slug: string; accountId: string | null; createdAt: string } | null> {
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      accountId: projects.accountId,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(accounts, eq(projects.accountId, accounts.id))
    .where(and(eq(accounts.slug, accountSlug), eq(projects.slug, projectSlug)));

  if (rows.length === 0) return null;
  return {
    id: rows[0].id,
    slug: rows[0].slug,
    accountId: rows[0].accountId,
    createdAt: rows[0].createdAt.toISOString(),
  };
}

export async function getProjectKey(projectId: string): Promise<string | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  return project?.projectKey ?? null;
}

export async function listProjectsByAccount(accountId: string) {
  return db.select().from(projects).where(eq(projects.accountId, accountId));
}
