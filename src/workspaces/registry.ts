import { eq } from "drizzle-orm";
import { db } from "../db";
import { workspaces } from "../db/schema";
import { uuidv7 } from "../lib/uuid";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const RESERVED_SLUGS = new Set([
  "api",
  "app",
  "admin",
  "www",
  "status",
  "mcp",
  "assets",
  "workspaces",
  "teams",
  "join",
  "health",
  "static",
  "login",
  "signup",
  "settings",
]);

function generateProjectKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `klry_proj_${hex}`;
}

export function validateSlug(slug: string): { valid: boolean; error?: string } {
  if (!SLUG_PATTERN.test(slug)) {
    return {
      valid: false,
      error:
        "Slug must be 3-40 characters, lowercase alphanumeric and hyphens, cannot start or end with a hyphen",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { valid: false, error: `Slug "${slug}" is reserved` };
  }
  return { valid: true };
}

export async function createWorkspace(slug: string): Promise<{
  slug: string;
  id: string;
  projectKey: string;
}> {
  const validation = validateSlug(slug);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const [existing] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  if (existing) {
    throw new Error(`Workspace "${slug}" already exists`);
  }

  const id = uuidv7();
  const projectKey = generateProjectKey();

  await db.insert(workspaces).values({
    id,
    slug,
    projectKey,
  });

  return { slug, id, projectKey };
}

export async function validateKey(
  slug: string,
  key: string
): Promise<{ valid: true; workspaceId: string } | { valid: false }> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  if (!workspace) {
    return { valid: false };
  }

  if (key !== workspace.projectKey) {
    return { valid: false };
  }

  return { valid: true, workspaceId: workspace.id };
}

export async function getWorkspaceBySlug(
  slug: string
): Promise<{ id: string; slug: string; createdAt: string } | null> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  if (!workspace) return null;
  return { id: workspace.id, slug: workspace.slug, createdAt: workspace.createdAt.toISOString() };
}

export async function getWorkspaceProjectKey(workspaceId: string): Promise<string | null> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  return workspace?.projectKey ?? null;
}
