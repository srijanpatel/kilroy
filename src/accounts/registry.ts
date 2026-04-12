import { eq } from "drizzle-orm";
import { db } from "../db";
import { accounts } from "../db/schema";
import { uuidv7 } from "../lib/uuid";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const RESERVED_SLUGS = new Set([
  "api",
  "admin",
  "login",
  "projects",
  "onboarding",
  "settings",
  "about",
  "help",
  "support",
  "static",
  "assets",
  "health",
  "status",
]);

export function validateAccountSlug(slug: string): { valid: boolean; error?: string } {
  if (!SLUG_PATTERN.test(slug)) {
    return {
      valid: false,
      error: "Slug must be 3-40 characters, lowercase alphanumeric and hyphens, cannot start or end with a hyphen",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { valid: false, error: `Slug "${slug}" is reserved` };
  }
  return { valid: true };
}

export async function createAccount(opts: {
  slug: string;
  displayName: string;
  authUserId: string;
}): Promise<{ id: string; slug: string; displayName: string }> {
  const validation = validateAccountSlug(opts.slug);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const [existing] = await db.select().from(accounts).where(eq(accounts.slug, opts.slug));
  if (existing) {
    throw new Error(`Account slug "${opts.slug}" is already taken`);
  }

  const id = uuidv7();
  await db.insert(accounts).values({
    id,
    slug: opts.slug,
    displayName: opts.displayName,
    authUserId: opts.authUserId,
  });

  return { id, slug: opts.slug, displayName: opts.displayName };
}

export async function getAccountById(id: string) {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
  return account ?? null;
}

export async function getAccountBySlug(slug: string) {
  const [account] = await db.select().from(accounts).where(eq(accounts.slug, slug));
  return account ?? null;
}

export async function getAccountByAuthUserId(authUserId: string) {
  const [account] = await db.select().from(accounts).where(eq(accounts.authUserId, authUserId));
  return account ?? null;
}

export function suggestSlug(provider: string, profile: { name?: string; email?: string; username?: string }): string {
  let raw = "";
  if (provider === "github" && profile.username) {
    raw = profile.username;
  } else if (profile.email) {
    raw = profile.email.split("@")[0];
  } else if (profile.name) {
    raw = profile.name;
  }

  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "user";
}
