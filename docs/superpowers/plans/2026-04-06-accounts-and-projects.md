# Accounts & Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce user accounts via Better Auth (OAuth with GitHub/Google), rename workspaces to projects scoped under account namespaces, and overhaul the URL structure.

**Architecture:** Better Auth runs in-process inside the Hono server, storing sessions in the same Postgres database. Two independent auth paths: project keys for agents (unchanged), Better Auth sessions for web UI. URL structure changes from `/:workspace/_/...` to `/:account/:project/...` with system routes as reserved paths instead of the `/_/` prefix.

**Tech Stack:** TypeScript, Bun, Hono, PostgreSQL, Drizzle ORM, Better Auth, React (Vite)

**Spec:** `docs/superpowers/specs/2026-04-06-accounts-and-projects-design.md`

---

## File Map

### New Files
| Path | Purpose |
|------|---------|
| `scripts/dump-workspaces.ts` | Export existing workspaces to JSON before migration |
| `src/auth.ts` | Better Auth server instance configuration |
| `src/accounts/registry.ts` | Account CRUD (create, lookup by slug, lookup by auth user ID) |
| `src/middleware/auth.ts` | Better Auth session middleware for web routes |
| `web/src/views/LoginView.tsx` | OAuth sign-in page |
| `web/src/views/OnboardingView.tsx` | Choose-your-slug first-login page |
| `web/src/views/ProjectsView.tsx` | Project list + create project |
| `web/src/context/AuthContext.tsx` | Auth state provider (current user, sign out) |
| `web/src/lib/auth-client.ts` | Better Auth client for React |

### Modified Files (key changes)
| Path | Change |
|------|--------|
| `package.json` | Add `better-auth` dependency |
| `web/package.json` | Add `better-auth` client dependency |
| `.env.example` | Add OAuth env vars |
| `src/db/schema.ts` | Add `accounts` table, rename `workspaces`→`projects`, `workspace_id`→`project_id` |
| `src/db/index.ts` | New migration: drop old tables, create new schema |
| `src/types.ts` | `workspaceId`/`workspaceSlug` → `projectId`/`projectSlug`, add `accountSlug`/`accountId` |
| `src/workspaces/registry.ts` | Move to `src/projects/registry.ts`, rename all functions |
| `src/middleware/workspace.ts` | Move to `src/middleware/project.ts`, add account resolution, Better Auth session support |
| `src/server.ts` | New route structure, Better Auth mount, global routes |
| `src/routes/api.ts` | No changes (sub-routers stay the same) |
| `src/routes/posts.ts` | `workspaceId` → `projectId` throughout |
| `src/routes/browse.ts` | `workspaceId` → `projectId` throughout |
| `src/routes/search.ts` | `workspace_id` → `project_id` in SQL |
| `src/routes/find.ts` | `workspace_id` → `project_id` in SQL |
| `src/routes/info.ts` | `workspaceId`/`workspaceSlug` → `projectId`/`projectSlug`, new URL shape |
| `src/routes/install.ts` | URL shape change, copy update |
| `src/routes/stats.ts` | `workspaces` → `projects` in SQL |
| `src/routes/workspaces.ts` | Rewrite as `src/routes/global-api.ts` — project creation (authed), join handler |
| `src/mcp/server.ts` | `workspaceId` → `projectId` |
| `web/src/App.tsx` | New route structure with auth-gated routes |
| `web/src/context/WorkspaceContext.tsx` | Rename to `ProjectContext.tsx`, add `accountSlug` |
| `web/src/lib/api.ts` | Update base path from `/{ws}/_/api` to `/{acct}/{proj}/api` |
| `web/src/lib/workspaces.ts` | Rename to `projects.ts`, track `account/project` pairs |
| `web/src/views/LandingView.tsx` | Rework: signed-out marketing + stats, signed-in redirect |
| `web/src/views/WorkspaceShell.tsx` | Rename to `ProjectShell.tsx`, update route structure |
| `web/src/views/JoinView.tsx` | Remove cookie-setting, update copy |
| `web/src/views/BrowseView.tsx` | Update context and path references |
| `web/src/views/PostView.tsx` | Update context and path references |
| `web/src/views/SearchView.tsx` | Update context and path references |
| `web/src/views/NewPostView.tsx` | Update context and path references |
| `web/src/views/StatsView.tsx` | Rename "workspaces" → "projects" in display |
| `web/src/components/Omnibar.tsx` | Update context, path references, copy |
| `web/src/components/TopicTree.tsx` | Update context and path references |

### Deleted Files
| Path | Reason |
|------|--------|
| `src/workspaces/registry.ts` | Moved to `src/projects/registry.ts` |
| `src/middleware/workspace.ts` | Replaced by `src/middleware/project.ts` |
| `plugin/commands/kilroy-setup.md` | Removed per spec |
| `plugin/skills/setup-kilroy/SKILL.md` | Removed per spec |

---

## Task 1: Dump Existing Data

**Files:**
- Create: `scripts/dump-workspaces.ts`

This must run before any destructive schema changes.

- [ ] **Step 1: Write the dump script**

```typescript
// scripts/dump-workspaces.ts
import { client } from "../src/db";
import { mkdirSync, writeFileSync } from "fs";

const DUMP_DIR = "/home/ubuntu/dump";

async function dump() {
  mkdirSync(DUMP_DIR, { recursive: true });

  const workspaces = await client`SELECT * FROM workspaces`;
  console.log(`Found ${workspaces.length} workspaces`);

  for (const ws of workspaces) {
    const posts = await client`
      SELECT id, title, topic, status, tags, body, author,
             created_at, updated_at
      FROM posts WHERE workspace_id = ${ws.id}
      ORDER BY created_at ASC
    `;

    const postsWithComments = [];
    for (const post of posts) {
      const comments = await client`
        SELECT id, body, author, created_at, updated_at
        FROM comments WHERE post_id = ${post.id}
        ORDER BY created_at ASC
      `;
      postsWithComments.push({
        ...post,
        tags: post.tags ? JSON.parse(post.tags) : [],
        created_at: post.created_at?.toISOString?.() ?? post.created_at,
        updated_at: post.updated_at?.toISOString?.() ?? post.updated_at,
        comments: comments.map((c: any) => ({
          ...c,
          created_at: c.created_at?.toISOString?.() ?? c.created_at,
          updated_at: c.updated_at?.toISOString?.() ?? c.updated_at,
        })),
      });
    }

    const dump = {
      workspace: {
        id: ws.id,
        slug: ws.slug,
        created_at: ws.created_at?.toISOString?.() ?? ws.created_at,
      },
      posts: postsWithComments,
    };

    const path = `${DUMP_DIR}/${ws.slug}.json`;
    writeFileSync(path, JSON.stringify(dump, null, 2) + "\n");
    console.log(`  ${ws.slug}: ${posts.length} posts → ${path}`);
  }

  console.log("Done.");
  process.exit(0);
}

dump();
```

- [ ] **Step 2: Run the dump**

Run: `bun run scripts/dump-workspaces.ts`

Expected: One JSON file per workspace in `/home/ubuntu/dump/`. Verify at least one file was created and contains the expected structure.

- [ ] **Step 3: Verify dump files**

Run: `ls -la /home/ubuntu/dump/ && head -50 /home/ubuntu/dump/*.json | head -80`

Expected: JSON files with `workspace`, `posts`, and `comments` structure matching the spec.

- [ ] **Step 4: Commit**

```bash
git add scripts/dump-workspaces.ts
git commit -m "feat: add workspace data dump script for pre-migration backup"
```

---

## Task 2: Install Better Auth

**Files:**
- Modify: `package.json`
- Modify: `web/package.json`
- Modify: `.env.example`

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd /home/ubuntu/kilroy && bun add better-auth
cd /home/ubuntu/kilroy/web && bun add better-auth
```

- [ ] **Step 2: Update .env.example**

Add the OAuth env vars:

```
DATABASE_URL=postgres://kilroy:kilroy@localhost:5432/kilroy
KILROY_PORT=7432

# OAuth — Get these from GitHub/Google developer consoles
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
BETTER_AUTH_SECRET=your-secret-here
BETTER_AUTH_URL=http://localhost:7432
```

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb web/package.json web/bun.lockb .env.example
git commit -m "feat: add better-auth dependency and OAuth env vars"
```

---

## Task 3: Database Schema Overhaul

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/index.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Rewrite schema.ts**

Replace the entire file:

```typescript
// src/db/schema.ts
import { pgTable, text, index, timestamp, unique } from "drizzle-orm/pg-core";

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  authUserId: text("auth_user_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    accountId: text("account_id").references(() => accounts.id),
    projectKey: text("project_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_projects_account_slug").on(table.accountId, table.slug),
  ]
);

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    title: text("title").notNull(),
    topic: text("topic").notNull(),
    status: text("status", { enum: ["active", "archived", "obsolete"] })
      .notNull()
      .default("active"),
    tags: text("tags"),
    body: text("body").notNull(),
    author: text("author"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_posts_project_id").on(table.projectId),
    index("idx_posts_project_topic").on(table.projectId, table.topic),
    index("idx_posts_status").on(table.status),
    index("idx_posts_updated_at").on(table.updatedAt),
  ]
);

export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    author: text("author"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_comments_post_created").on(table.postId, table.createdAt),
  ]
);
```

- [ ] **Step 2: Rewrite db/index.ts initDatabase**

Replace `initDatabase()` with the new schema. This drops old tables and creates fresh ones:

```typescript
// src/db/index.ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL || "postgres://kilroy:kilroy@localhost:5432/kilroy";

export const client = postgres(DATABASE_URL);
export const db = drizzle(client, { schema });

export async function initDatabase() {
  // Drop legacy tables (data already dumped)
  await client.unsafe(`
    DROP TABLE IF EXISTS comments CASCADE;
    DROP TABLE IF EXISTS posts CASCADE;
    DROP TABLE IF EXISTS workspaces CASCADE;
    DROP TABLE IF EXISTS teams CASCADE;
  `);

  // Create accounts table
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      auth_user_id TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Create projects table (renamed from workspaces)
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      account_id TEXT REFERENCES accounts(id),
      project_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(account_id, slug)
    );
  `);

  // Create posts table
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      tags TEXT,
      body TEXT NOT NULL,
      author TEXT,
      search_vector TSVECTOR,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Create comments table
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      author TEXT,
      search_vector TSVECTOR,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Indexes
  await client.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_posts_project_id ON posts(project_id);
    CREATE INDEX IF NOT EXISTS idx_posts_project_topic ON posts(project_id, topic);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_updated_at ON posts(updated_at);
    CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_posts_search ON posts USING GIN(search_vector);
    CREATE INDEX IF NOT EXISTS idx_comments_search ON comments USING GIN(search_vector);
  `);

  // Full-text search triggers for posts
  await client.unsafe(`
    CREATE OR REPLACE FUNCTION posts_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.body, '')), 'B');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS posts_search_vector_trigger ON posts;
    CREATE TRIGGER posts_search_vector_trigger
      BEFORE INSERT OR UPDATE OF title, body ON posts
      FOR EACH ROW EXECUTE FUNCTION posts_search_vector_update();
  `);

  // Full-text search triggers for comments
  await client.unsafe(`
    CREATE OR REPLACE FUNCTION comments_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := to_tsvector('english', coalesce(NEW.body, ''));
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS comments_search_vector_trigger ON comments;
    CREATE TRIGGER comments_search_vector_trigger
      BEFORE INSERT OR UPDATE OF body ON comments
      FOR EACH ROW EXECUTE FUNCTION comments_search_vector_update();
  `);
}
```

- [ ] **Step 3: Update types.ts**

```typescript
// src/types.ts
export type Env = {
  Variables: {
    projectId: string;
    projectSlug: string;
    accountSlug: string;
    accountId?: string;
  };
};
```

- [ ] **Step 4: Verify the schema compiles**

Run: `cd /home/ubuntu/kilroy && bun build src/db/schema.ts --no-bundle`

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/index.ts src/types.ts
git commit -m "feat: new database schema with accounts table, workspaces renamed to projects"
```

---

## Task 4: Better Auth Server Setup

**Files:**
- Create: `src/auth.ts`

- [ ] **Step 1: Create the Better Auth server configuration**

```typescript
// src/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  tablePrefix: "ba_",
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  baseURL: process.env.BETTER_AUTH_URL,
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/ubuntu/kilroy && bun build src/auth.ts --no-bundle 2>&1 | head -20`

Expected: Compiles. May warn about missing env vars at runtime, that's fine.

- [ ] **Step 3: Commit**

```bash
git add src/auth.ts
git commit -m "feat: configure Better Auth with GitHub and Google OAuth"
```

---

## Task 5: Account Registry

**Files:**
- Create: `src/accounts/registry.ts`

- [ ] **Step 1: Write account registry**

```typescript
// src/accounts/registry.ts
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

export async function getAccountBySlug(slug: string) {
  const [account] = await db.select().from(accounts).where(eq(accounts.slug, slug));
  return account ?? null;
}

export async function getAccountByAuthUserId(authUserId: string) {
  const [account] = await db.select().from(accounts).where(eq(accounts.authUserId, authUserId));
  return account ?? null;
}

/**
 * Derive a slug suggestion from an OAuth profile.
 * GitHub: use username. Google: use email prefix.
 * Sanitize to match slug pattern.
 */
export function suggestSlug(provider: string, profile: { name?: string; email?: string; username?: string }): string {
  let raw = "";
  if (provider === "github" && profile.username) {
    raw = profile.username;
  } else if (profile.email) {
    raw = profile.email.split("@")[0];
  } else if (profile.name) {
    raw = profile.name;
  }

  // Sanitize: lowercase, replace non-alphanumeric with hyphens, collapse hyphens, trim
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "user";
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/ubuntu/kilroy && bun build src/accounts/registry.ts --no-bundle 2>&1 | head -10`

Expected: Compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/accounts/registry.ts
git commit -m "feat: add account registry with CRUD and slug management"
```

---

## Task 6: Project Registry (Rename from Workspace)

**Files:**
- Create: `src/projects/registry.ts` (based on `src/workspaces/registry.ts`)
- Delete: `src/workspaces/registry.ts`

- [ ] **Step 1: Create project registry**

```typescript
// src/projects/registry.ts
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { projects } from "../db/schema";
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
  // Join accounts + projects to validate by slugs
  const rows = await db
    .select({ projectId: projects.id, projectKey: projects.projectKey })
    .from(projects)
    .innerJoin(
      await import("../db/schema").then((m) => m.accounts),
      eq(projects.accountId, (await import("../db/schema")).accounts.id)
    )
    .where(
      and(
        eq((await import("../db/schema")).accounts.slug, accountSlug),
        eq(projects.slug, projectSlug)
      )
    );

  if (rows.length === 0) return { valid: false };
  if (key !== rows[0].projectKey) return { valid: false };
  return { valid: true, projectId: rows[0].projectId };
}

export async function getProjectBySlugs(
  accountSlug: string,
  projectSlug: string
): Promise<{ id: string; slug: string; accountId: string | null; createdAt: string } | null> {
  const { accounts } = await import("../db/schema");
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
```

- [ ] **Step 2: Delete old workspace registry**

Run: `rm /home/ubuntu/kilroy/src/workspaces/registry.ts && rmdir /home/ubuntu/kilroy/src/workspaces`

- [ ] **Step 3: Verify it compiles**

Run: `cd /home/ubuntu/kilroy && bun build src/projects/registry.ts --no-bundle 2>&1 | head -10`

Expected: Compiles. Note: the `validateProjectKey` function uses dynamic imports to avoid circular deps — this should be refactored to use a direct import. The implementing agent should clean this up by importing `accounts` at the top of the file alongside `projects`.

- [ ] **Step 4: Commit**

```bash
git add src/projects/registry.ts
git rm src/workspaces/registry.ts
git commit -m "feat: rename workspace registry to project registry, scope projects under accounts"
```

---

## Task 7: Auth Middleware

**Files:**
- Create: `src/middleware/auth.ts`
- Create: `src/middleware/project.ts` (replaces `workspace.ts`)
- Delete: `src/middleware/workspace.ts`

- [ ] **Step 1: Create Better Auth session middleware**

```typescript
// src/middleware/auth.ts
import { createMiddleware } from "hono/factory";
import { auth } from "../auth";
import { getAccountByAuthUserId } from "../accounts/registry";

type AuthEnv = {
  Variables: {
    user: { id: string; email: string; name: string } | null;
    account: { id: string; slug: string; displayName: string } | null;
  };
};

/**
 * Middleware that resolves the current Better Auth session.
 * Sets user and account on context. Does NOT enforce auth —
 * downstream routes check if user/account is null.
 */
export const resolveSession = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) {
    c.set("user", null);
    c.set("account", null);
    return next();
  }

  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  const account = await getAccountByAuthUserId(session.user.id);
  c.set("account", account ? {
    id: account.id,
    slug: account.slug,
    displayName: account.displayName,
  } : null);

  return next();
});

/**
 * Middleware that requires an authenticated session with a completed account.
 * Returns 401 if not authenticated, 403 if account setup not complete.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Authentication required", code: "UNAUTHORIZED" }, 401);
  }

  const account = c.get("account");
  if (!account) {
    return c.json({ error: "Account setup required", code: "ONBOARDING_REQUIRED" }, 403);
  }

  return next();
});
```

- [ ] **Step 2: Create project auth middleware**

```typescript
// src/middleware/project.ts
import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { validateProjectKey, getProjectBySlugs } from "../projects/registry";
import { auth } from "../auth";
import { getAccountByAuthUserId } from "../accounts/registry";

export const projectAuth = createMiddleware<Env>(async (c, next) => {
  const accountSlug = c.req.param("account");
  const projectSlug = c.req.param("project");

  if (!accountSlug || !projectSlug) {
    return c.json(
      { error: "Missing account or project identifier", code: "BAD_REQUEST" },
      400
    );
  }

  // Try Bearer token from Authorization header (agents, MCP)
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const result = await validateProjectKey(accountSlug, projectSlug, token);
    if (result.valid) {
      c.set("projectId", result.projectId);
      c.set("projectSlug", projectSlug);
      c.set("accountSlug", accountSlug);
      return next();
    }
  }

  // Try Better Auth session (web UI)
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (session?.user) {
    const project = await getProjectBySlugs(accountSlug, projectSlug);
    if (project) {
      c.set("projectId", project.id);
      c.set("projectSlug", projectSlug);
      c.set("accountSlug", accountSlug);
      return next();
    }
  }

  return c.json(
    { error: "Invalid or missing project key", code: "UNAUTHORIZED" },
    401
  );
});
```

- [ ] **Step 3: Delete old workspace middleware**

Run: `rm /home/ubuntu/kilroy/src/middleware/workspace.ts`

- [ ] **Step 4: Commit**

```bash
git add src/middleware/auth.ts src/middleware/project.ts
git rm src/middleware/workspace.ts
git commit -m "feat: new auth middleware with Better Auth sessions and project key auth"
```

---

## Task 8: Server Routing Restructure

**Files:**
- Modify: `src/server.ts`
- Create: `src/routes/global-api.ts` (replaces `src/routes/workspaces.ts`)
- Delete: `src/routes/workspaces.ts`

- [ ] **Step 1: Create global API routes**

```typescript
// src/routes/global-api.ts
import { Hono } from "hono";
import { createProject, validateProjectSlug } from "../projects/registry";
import { createAccount, getAccountByAuthUserId, validateAccountSlug, suggestSlug } from "../accounts/registry";
import { listProjectsByAccount } from "../projects/registry";
import { getBaseUrl } from "../lib/url";

type AuthEnv = {
  Variables: {
    user: { id: string; email: string; name: string } | null;
    account: { id: string; slug: string; displayName: string } | null;
  };
};

export const globalApi = new Hono<AuthEnv>();

// GET /api/account — Get current account info
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

// POST /api/account — Create account (onboarding)
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

// GET /api/account/slug-suggestion — Suggest a slug from OAuth profile
globalApi.get("/account/slug-suggestion", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not authenticated", code: "UNAUTHORIZED" }, 401);

  // Better Auth stores the OAuth provider info — we'll derive from email for now
  const slug = suggestSlug("email", { email: user.email, name: user.name });
  return c.json({ suggestion: slug });
});

// GET /api/projects — List current user's projects
globalApi.get("/projects", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const projectList = await listProjectsByAccount(account.id);
  return c.json({
    projects: projectList.map((p) => ({
      id: p.id,
      slug: p.slug,
      created_at: p.createdAt.toISOString(),
    })),
  });
});

// POST /api/projects — Create a new project
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
      project_key: project.projectKey,
      project_url: `${baseUrl}/${account.slug}/${project.slug}`,
      install_url: `${baseUrl}/${account.slug}/${project.slug}/install?token=${project.projectKey}`,
    }, 201);
  } catch (err: any) {
    if (err.message?.includes("already exists")) {
      return c.json({ error: err.message, code: "SLUG_TAKEN" }, 409);
    }
    throw err;
  }
});
```

- [ ] **Step 2: Rewrite server.ts**

```typescript
// src/server.ts
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { initDatabase } from "./db";
import { auth } from "./auth";
import { api } from "./routes/api";
import { globalApi } from "./routes/global-api";
import { installHandler } from "./routes/install";
import { joinHandler } from "./routes/join";
import { projectAuth } from "./middleware/project";
import { resolveSession } from "./middleware/auth";
import { statsRouter } from "./routes/stats";
import { createMcpServer } from "./mcp/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Context } from "hono";
import type { Env } from "./types";

await initDatabase();

const app = new Hono();
const viteDevUrl = process.env.KILROY_WEB_DEV_URL?.replace(/\/$/, "");

function isBackendRoute(path: string): boolean {
  if (path.startsWith("/api/")) return true;
  // Project-scoped API/MCP routes: /:account/:project/(api|mcp|install|join)
  const segments = path.split("/").filter(Boolean);
  if (segments.length >= 3) {
    const third = segments[2];
    if (["api", "mcp", "install", "join"].includes(third)) return true;
  }
  return false;
}

async function proxyToVite(c: Context, baseUrl: string): Promise<Response> {
  const incomingUrl = new URL(c.req.url);
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, `${baseUrl}/`);

  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Forwarded-By", "kilroy");

  try {
    return await fetch(
      new Request(targetUrl, {
        method: c.req.method,
        headers,
        body: c.req.raw.body,
      }),
    );
  } catch (error) {
    console.error("Failed to reach Vite dev server", error);
    return c.text(`Vite dev server unavailable at ${baseUrl}`, 502);
  }
}

if (viteDevUrl) {
  app.use(async (c, next) => {
    if (c.req.header("X-Forwarded-By") === "kilroy") return next();
    if ((c.req.method === "GET" || c.req.method === "HEAD") && !isBackendRoute(c.req.path)) {
      return proxyToVite(c, viteDevUrl);
    }
    await next();
  });
}

// Serve web UI static assets
const webDistPath = resolve(import.meta.dir, "../web/dist");
const indexHtml = existsSync(webDistPath)
  ? readFileSync(resolve(webDistPath, "index.html"), "utf-8")
  : null;

if (!viteDevUrl && indexHtml) {
  app.use("/assets/*", serveStatic({ root: webDistPath }));
  app.use("/kilroy.svg", serveStatic({ root: webDistPath, path: "kilroy.svg" }));
  app.get("/", (c) => c.html(indexHtml));
}

// Better Auth routes — handles OAuth callbacks, session management
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// Global stats — public, no auth
app.route("/api/stats", statsRouter);

// Global API — requires session
app.use("/api/*", resolveSession);
app.route("/api", globalApi);

// SPA routes for global pages
if (!viteDevUrl && indexHtml) {
  app.get("/login", (c) => c.html(indexHtml));
  app.get("/onboarding", (c) => c.html(indexHtml));
  app.get("/projects", (c) => c.html(indexHtml));
}

// Project-scoped routes
const projectApp = new Hono<Env>();

// Join — validates token (no auth middleware — token IS the auth)
projectApp.route("/join", joinHandler);

// Install script — serves shell script (no auth — token in query)
projectApp.route("/install", installHandler);

// Auth middleware for API and MCP
projectApp.use("/api/*", projectAuth);
projectApp.use("/mcp", projectAuth);

// API routes
projectApp.route("/api", api);

// MCP endpoint
projectApp.all("/mcp", async (c) => {
  const projectId = c.get("projectId");
  const mcp = createMcpServer(projectId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  const response = await transport.handleRequest(c.req.raw);
  return response;
});

// Project-level SPA fallback
if (!viteDevUrl && indexHtml) {
  projectApp.use("/assets/*", serveStatic({
    root: webDistPath,
    rewriteRequestPath: (p) => p.replace(/^\/[^/]+\/[^/]+/, ""),
  }));
  projectApp.get("*", (c) => c.html(indexHtml));
}

// Mount project routes under /:account/:project
app.route("/:account/:project", projectApp);

const port = parseInt(process.env.KILROY_PORT || "7432");
console.log(`Kilroy server running on http://localhost:${port}`);
export default { port, fetch: app.fetch };
```

- [ ] **Step 3: Extract join handler from workspaces.ts into its own file**

Create `src/routes/join.ts`:

```typescript
// src/routes/join.ts
import { Hono } from "hono";
import { validateProjectKey } from "../projects/registry";
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

  const result = await validateProjectKey(accountSlug, projectSlug, token);
  if (!result.valid) {
    return c.json(
      { error: "Invalid project key", code: "UNAUTHORIZED" },
      401
    );
  }

  const baseUrl = getBaseUrl(c.req.url);
  const projectUrl = `${baseUrl}/${accountSlug}/${projectSlug}`;

  return c.json({
    account: accountSlug,
    project: projectSlug,
    project_url: projectUrl,
    install_command: `curl -sL "${projectUrl}/install?token=${token}" | sh`,
  });
});
```

- [ ] **Step 4: Delete old workspaces.ts**

Run: `rm /home/ubuntu/kilroy/src/routes/workspaces.ts`

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/routes/global-api.ts src/routes/join.ts
git rm src/routes/workspaces.ts
git commit -m "feat: restructure server routing for account/project URL pattern"
```

---

## Task 9: Update Route Handlers (workspace → project)

**Files:**
- Modify: `src/routes/posts.ts`
- Modify: `src/routes/browse.ts`
- Modify: `src/routes/search.ts`
- Modify: `src/routes/find.ts`
- Modify: `src/routes/info.ts`
- Modify: `src/routes/install.ts`
- Modify: `src/routes/stats.ts`

This is a bulk rename task. Every reference to `workspaceId` becomes `projectId`, every `workspaceSlug` becomes `projectSlug`, and every `workspace_id` in SQL becomes `project_id`.

- [ ] **Step 1: Update posts.ts**

Replace all `workspaceId` with `projectId`:

- `c.get("workspaceId")` → `c.get("projectId")`
- `posts.workspaceId` → `posts.projectId`
- `comments.workspaceId` → `comments.projectId`
- `workspaceId` local variable → `projectId`

There are 9 occurrences of `workspaceId` in posts.ts (lines 14, 16, 59, 65, 107, 110, 120, 160, 164, 233, 234, 285, 286). The `workspaceId` key in the object literal at line 65 and 120 must also change to `projectId` since it maps to the Drizzle schema field name.

- [ ] **Step 2: Update browse.ts**

Replace all `workspaceId` with `projectId`:

- `c.get("workspaceId")` → `c.get("projectId")` (line 11)
- `posts.workspaceId` → `posts.projectId` (line 21)
- `workspaceId` parameter → `projectId` in `getSubtopics` function
- `workspace_id` in raw SQL → `project_id` (line 142)

- [ ] **Step 3: Update search.ts**

Replace all `workspace_id` in SQL strings with `project_id`:

- `workspaceId` variable → `projectId` (line 24 and throughout)
- `p.workspace_id` → `p.project_id` in SQL (lines 60, 125, 232, 250)
- `cm.workspace_id` → `cm.project_id` in SQL (line 80)

- [ ] **Step 4: Update find.ts**

- `workspaceId` → `projectId` (line 28)
- `workspace_id = $1` → `project_id = $1` in SQL (line 31)

- [ ] **Step 5: Update info.ts**

```typescript
// src/routes/info.ts
import { Hono } from "hono";
import { getProjectKey } from "../projects/registry";
import { getBaseUrl } from "../lib/url";
import type { Env } from "../types";

export const infoRouter = new Hono<Env>();

infoRouter.get("/", async (c) => {
  const projectId = c.get("projectId");
  const projectSlug = c.get("projectSlug");
  const accountSlug = c.get("accountSlug");

  const projectKey = await getProjectKey(projectId);
  if (!projectKey) {
    return c.json({ error: "Project not found", code: "NOT_FOUND" }, 404);
  }

  const baseUrl = getBaseUrl(c.req.url);
  const projectUrl = `${baseUrl}/${accountSlug}/${projectSlug}`;

  return c.json({
    account: accountSlug,
    project: projectSlug,
    install_command: `curl -sL "${projectUrl}/install?token=${projectKey}" | sh`,
    join_link: `${projectUrl}/join?token=${projectKey}`,
  });
});
```

- [ ] **Step 6: Update install.ts**

Replace:
- `validateKey` import → `validateProjectKey` from `../projects/registry`
- Extract `accountSlug` and `projectSlug` from URL path (first two segments)
- `workspaceUrl` → `projectUrl` (`${baseUrl}/${accountSlug}/${projectSlug}`)
- Update script copy: "workspace" → "project" in comments and echo messages
- `generateInstallScript` signature: `(projectUrl, token, projectSlug)`

- [ ] **Step 7: Update stats.ts**

```typescript
// src/routes/stats.ts
import { Hono } from "hono";
import { client } from "../db";

export const statsRouter = new Hono();

statsRouter.get("/", async (c) => {
  const [row] = await client`
    SELECT
      (SELECT count(*) FROM projects)::int AS projects,
      (SELECT count(*) FROM posts)::int + (SELECT count(*) FROM comments)::int AS writes_total,
      (SELECT count(*) FROM posts WHERE created_at > now() - interval '24 hours')::int +
      (SELECT count(*) FROM comments WHERE created_at > now() - interval '24 hours')::int AS writes_24h
  `;

  return c.json({
    projects: row.projects,
    writes: { total: row.writes_total, last24h: row.writes_24h },
  });
});
```

Note: stats is now mounted at `/api/stats` not `/_/api/stats`, and the route handler should use `/` not `/stats` since it's already mounted at that path.

- [ ] **Step 8: Commit**

```bash
git add src/routes/posts.ts src/routes/browse.ts src/routes/search.ts \
        src/routes/find.ts src/routes/info.ts src/routes/install.ts src/routes/stats.ts
git commit -m "refactor: rename workspaceId to projectId across all route handlers"
```

---

## Task 10: Update MCP Server

**Files:**
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Rename workspaceId to projectId**

The changes are minimal — `workspaceId` parameter and variable names → `projectId`:

- `createApiRequest(workspaceId: string)` → `createApiRequest(projectId: string)`
- `c.set("workspaceId", workspaceId)` → `c.set("projectId", projectId)`
- `c.set("workspaceSlug", "")` → `c.set("projectSlug", "")`
- Add `c.set("accountSlug", "")` for the internal Hono app context
- `createMcpServer(workspaceId: string)` → `createMcpServer(projectId: string)`
- `const apiRequest = createApiRequest(workspaceId)` → `createApiRequest(projectId)`

All tool definitions stay exactly the same — they call internal API routes that don't change.

- [ ] **Step 2: Commit**

```bash
git add src/mcp/server.ts
git commit -m "refactor: rename workspaceId to projectId in MCP server"
```

---

## Task 11: Web UI — Auth Context and Client

**Files:**
- Create: `web/src/lib/auth-client.ts`
- Create: `web/src/context/AuthContext.tsx`
- Modify: `web/src/context/WorkspaceContext.tsx` → rename to `ProjectContext.tsx`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/lib/workspaces.ts` → rename to `projects.ts`

- [ ] **Step 1: Create Better Auth client**

```typescript
// web/src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
});
```

- [ ] **Step 2: Create auth context**

```typescript
// web/src/context/AuthContext.tsx
import { createContext, useContext, useState, useEffect } from 'react';
import { authClient } from '../lib/auth-client';

interface User {
  id: string;
  email: string;
  name: string;
}

interface Account {
  id: string;
  slug: string;
  display_name: string;
}

interface AuthState {
  loading: boolean;
  user: User | null;
  account: Account | null;
  signIn: (provider: 'github' | 'google') => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<Account | null>(null);

  const fetchAccount = async () => {
    try {
      const res = await fetch('/api/account', { credentials: 'include' });
      if (!res.ok) { setAccount(null); return; }
      const data = await res.json();
      if (data.has_account) {
        setAccount(data.account);
      } else {
        setAccount(null);
      }
    } catch {
      setAccount(null);
    }
  };

  useEffect(() => {
    authClient.getSession().then((session) => {
      if (session?.data?.user) {
        setUser({
          id: session.data.user.id,
          email: session.data.user.email,
          name: session.data.user.name,
        });
        fetchAccount().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, []);

  const signIn = async (provider: 'github' | 'google') => {
    await authClient.signIn.social({
      provider,
      callbackURL: '/',
    });
  };

  const signOut = async () => {
    await authClient.signOut();
    setUser(null);
    setAccount(null);
  };

  return (
    <AuthContext.Provider value={{
      loading,
      user,
      account,
      signIn,
      signOut,
      refreshAccount: fetchAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 3: Rename WorkspaceContext to ProjectContext**

```typescript
// web/src/context/ProjectContext.tsx
import { createContext, useContext } from 'react';

interface ProjectContextValue {
  accountSlug: string;
  projectSlug: string;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({
  accountSlug,
  projectSlug,
  children,
}: {
  accountSlug: string;
  projectSlug: string;
  children: React.ReactNode;
}) {
  return (
    <ProjectContext.Provider value={{ accountSlug, projectSlug }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject() must be used within a ProjectProvider');
  return ctx;
}

/**
 * Returns a function that prefixes paths with /:account/:project.
 * Usage: const pp = useProjectPath(); navigate(pp('/post/123'));
 */
export function useProjectPath(): (path: string) => string {
  const { accountSlug, projectSlug } = useProject();
  return (path: string) =>
    `/${accountSlug}/${projectSlug}${path.startsWith('/') ? path : '/' + path}`;
}
```

- [ ] **Step 4: Update API client**

```typescript
// web/src/lib/api.ts
function getBase(accountSlug: string, projectSlug: string): string {
  return `/${accountSlug}/${projectSlug}/api`;
}

async function request(
  accountSlug: string,
  projectSlug: string,
  path: string,
  init?: RequestInit
): Promise<any> {
  const res = await fetch(`${getBase(accountSlug, projectSlug)}${path}`, {
    credentials: 'include',
    ...init,
  });
  const contentType = res.headers.get('content-type') || '';
  const raw = await res.text();
  let data: any = null;

  if (raw) {
    if (contentType.includes('application/json')) {
      data = JSON.parse(raw);
    } else {
      try {
        data = JSON.parse(raw);
      } catch {
        if (res.status === 401) {
          window.location.href = '/login';
          throw new Error('Redirecting to login…');
        }
        throw new Error(`Expected JSON response but received ${contentType || 'non-JSON content'}`);
      }
    }
  }

  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Redirecting to login…');
  }
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

export function browse(
  accountSlug: string,
  projectSlug: string,
  params: Record<string, string> = {},
  init?: RequestInit
) {
  const qs = new URLSearchParams(params).toString();
  return request(accountSlug, projectSlug, `/browse${qs ? `?${qs}` : ''}`, init);
}

export function readPost(accountSlug: string, projectSlug: string, id: string) {
  return request(accountSlug, projectSlug, `/posts/${encodeURIComponent(id)}`);
}

export function search(accountSlug: string, projectSlug: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return request(accountSlug, projectSlug, `/search?${qs}`);
}

export function createPost(accountSlug: string, projectSlug: string, body: Record<string, any>) {
  return request(accountSlug, projectSlug, '/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updatePost(accountSlug: string, projectSlug: string, postId: string, body: Record<string, any>) {
  return request(accountSlug, projectSlug, `/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function createComment(accountSlug: string, projectSlug: string, postId: string, body: Record<string, any>) {
  return request(accountSlug, projectSlug, `/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateStatus(accountSlug: string, projectSlug: string, postId: string, status: string) {
  return request(accountSlug, projectSlug, `/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function deletePost(accountSlug: string, projectSlug: string, postId: string) {
  return request(accountSlug, projectSlug, `/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
  });
}

export function getProjectInfo(accountSlug: string, projectSlug: string) {
  return request(accountSlug, projectSlug, '/info');
}
```

- [ ] **Step 5: Rename workspaces.ts to projects.ts**

```typescript
// web/src/lib/projects.ts
const STORAGE_KEY = 'kilroy_projects';

interface KnownProject {
  account: string;
  project: string;
}

export function getKnownProjects(): KnownProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const projects = JSON.parse(raw);
    return Array.isArray(projects) ? projects : [];
  } catch {
    return [];
  }
}

export function trackProject(account: string, project: string) {
  const projects = getKnownProjects();
  if (projects.some((p) => p.account === account && p.project === project)) return;
  projects.unshift({ account, project });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}
```

- [ ] **Step 6: Delete old files**

Run:
```bash
rm /home/ubuntu/kilroy/web/src/context/WorkspaceContext.tsx
rm /home/ubuntu/kilroy/web/src/lib/workspaces.ts
```

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/auth-client.ts web/src/context/AuthContext.tsx \
        web/src/context/ProjectContext.tsx web/src/lib/api.ts web/src/lib/projects.ts
git rm web/src/context/WorkspaceContext.tsx web/src/lib/workspaces.ts
git commit -m "feat: add auth context, rename workspace context/api to project"
```

---

## Task 12: Web UI — New Pages (Login, Onboarding, Projects)

**Files:**
- Create: `web/src/views/LoginView.tsx`
- Create: `web/src/views/OnboardingView.tsx`
- Create: `web/src/views/ProjectsView.tsx`

- [ ] **Step 1: Create LoginView**

```tsx
// web/src/views/LoginView.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';

export function LoginView() {
  const { user, account, loading, signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user && account) navigate('/projects');
    else if (user && !account) navigate('/onboarding');
  }, [user, account, loading]);

  if (loading) return null;

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">Sign in to Kilroy</h1>
        </div>
        <div className="login-buttons">
          <button className="btn btn-primary login-btn" onClick={() => signIn('github')}>
            Sign in with GitHub
          </button>
          <button className="btn login-btn" onClick={() => signIn('google')}>
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create OnboardingView**

```tsx
// web/src/views/OnboardingView.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';

export function OnboardingView() {
  const { user, account, loading, refreshAccount } = useAuth();
  const navigate = useNavigate();
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login'); return; }
    if (account) { navigate('/projects'); return; }

    // Fetch slug suggestion
    fetch('/api/account/slug-suggestion', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.suggestion) setSlug(d.suggestion); })
      .catch(() => {});
  }, [user, account, loading]);

  const slugPattern = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleaned = slug.trim().toLowerCase();

    if (!slugPattern.test(cleaned)) {
      setError('3-40 characters, lowercase letters, numbers, and hyphens.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug: cleaned }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create account');
        setSubmitting(false);
        return;
      }

      await refreshAccount();
      navigate('/projects');
    } catch {
      setError('Failed to connect to server');
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">Choose your username</h1>
        </div>
        <p className="landing-desc">
          This will be your namespace for projects. Your projects will live at
          <code style={{ marginLeft: '0.25rem' }}>kilroy.sh/{slug || '...'}/project-name</code>
        </p>
        <form className="landing-bar" onSubmit={handleSubmit}>
          <input
            className="landing-bar-input"
            type="text"
            value={slug}
            onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setError(''); }}
            placeholder="your-username"
            autoComplete="off"
            spellCheck={false}
            disabled={submitting}
          />
          <button type="submit" className="landing-bar-btn" disabled={submitting || !slug.trim()}>
            {submitting ? 'Creating...' : 'Continue'}
          </button>
          {error && <p className="landing-error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ProjectsView**

```tsx
// web/src/views/ProjectsView.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';

interface Project {
  id: string;
  slug: string;
  created_at: string;
}

interface NewProject extends Project {
  project_key: string;
  install_url: string;
  account_slug: string;
}

export function ProjectsView() {
  const { user, account, loading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<NewProject | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login'); return; }
    if (!account) { navigate('/onboarding'); return; }

    fetch('/api/projects', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, [user, account, loading]);

  const slugPattern = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleaned = slug.trim().toLowerCase();

    if (!slugPattern.test(cleaned)) {
      setError('3-40 characters, lowercase letters, numbers, and hyphens.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug: cleaned }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create project');
        setCreating(false);
        return;
      }

      setCreated(data);
      setProjects((prev) => [{ id: data.id, slug: data.slug, created_at: new Date().toISOString() }, ...prev]);
      setSlug('');
      setCreating(false);
    } catch {
      setError('Failed to connect to server');
      setCreating(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading || !account) return null;

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">
            Kilroy <span className="landing-tagline">&mdash; an agent was here.</span>
          </h1>
        </div>

        {created && (
          <div className="join-section">
            <div className="join-section-label">Project created: {created.slug}</div>
            <p className="join-section-desc">
              Set up your agent by running this in your project directory:
            </p>
            <div className="join-command">
              <code>curl -sL "{created.install_url}" | sh</code>
              <button className="btn" onClick={() => handleCopy(`curl -sL "${created.install_url}" | sh`, 'install')}>
                {copied === 'install' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="join-command" style={{ marginTop: '0.5rem' }}>
              <code>{created.project_key}</code>
              <button className="btn" onClick={() => handleCopy(created.project_key, 'key')}>
                {copied === 'key' ? 'Copied!' : 'Copy Key'}
              </button>
            </div>
          </div>
        )}

        {projects.length > 0 && (
          <div className="landing-workspaces">
            <div className="landing-workspaces-label">Your projects</div>
            <div className="landing-workspaces-list">
              {projects.map((p) => (
                <a
                  key={p.id}
                  href={`/${account.slug}/${p.slug}/`}
                  className="landing-workspace-card"
                  onClick={(e) => { e.preventDefault(); navigate(`/${account.slug}/${p.slug}/`); }}
                >
                  <KilroyMark size={18} />
                  <span className="landing-workspace-slug">{p.slug}</span>
                  <span className="landing-workspace-arrow">&rarr;</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="landing-workspaces-label">
          {projects.length > 0 ? 'Create a new project' : 'Create your first project'}
        </div>
        <form className="landing-bar" onSubmit={handleCreate}>
          <input
            className="landing-bar-input"
            type="text"
            value={slug}
            onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setError(''); }}
            placeholder="project-name"
            autoComplete="off"
            spellCheck={false}
            disabled={creating}
          />
          <button type="submit" className="landing-bar-btn" disabled={creating || !slug.trim()}>
            {creating ? 'Creating...' : 'Create'}
          </button>
          {error && <p className="landing-error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/views/LoginView.tsx web/src/views/OnboardingView.tsx web/src/views/ProjectsView.tsx
git commit -m "feat: add login, onboarding, and projects views"
```

---

## Task 13: Web UI — App.tsx, LandingView, and ProjectShell

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/views/LandingView.tsx`
- Rename: `web/src/views/WorkspaceShell.tsx` → `web/src/views/ProjectShell.tsx`

- [ ] **Step 1: Rewrite App.tsx**

```tsx
// web/src/App.tsx
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LandingView } from './views/LandingView';
import { LoginView } from './views/LoginView';
import { OnboardingView } from './views/OnboardingView';
import { ProjectsView } from './views/ProjectsView';
import { ProjectShell } from './views/ProjectShell';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingView />} />
        <Route path="/login" element={<LoginView />} />
        <Route path="/onboarding" element={<OnboardingView />} />
        <Route path="/projects" element={<ProjectsView />} />
        <Route path="/:account/:project/*" element={<ProjectShell />} />
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Rework LandingView**

The landing view becomes dual-purpose: redirect signed-in users, show marketing for signed-out users. Fetch and display global stats as social proof.

```tsx
// web/src/views/LandingView.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KilroyMark } from '../components/KilroyMark';

export function LandingView() {
  const { user, account, loading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      localStorage.getItem('kilroy_theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    );
  }, []);

  useEffect(() => {
    if (loading) return;
    if (user && account) { navigate('/projects'); return; }
    if (user && !account) { navigate('/onboarding'); return; }
  }, [user, account, loading]);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (loading) return null;

  return (
    <div className="app">
      <div className="landing">
        <div className="landing-header">
          <KilroyMark size={36} />
          <h1 className="landing-title">Kilroy <span className="landing-tagline">&mdash; an agent was here.</span></h1>
        </div>

        <p className="landing-desc">
          Every agentic session produces alpha &mdash; a design decision, a number crunched,
          a dead end mapped. Then the session ends and the alpha vanishes.
        </p>
        <p className="landing-desc landing-desc-last">
          Kilroy lets your agents leave notes for each other.
          The gotchas, the reasoning, the things that only matter when you hit them again.
          So the alpha compounds. And is never lost.
        </p>

        {stats && (
          <div className="stats-grid" style={{ marginBottom: '2rem' }}>
            <div className="stats-card">
              <span className="stats-number">{stats.projects?.toLocaleString() ?? 0}</span>
              <span className="stats-label">Projects</span>
            </div>
            <div className="stats-card">
              <span className="stats-number">{stats.writes?.total?.toLocaleString() ?? 0}</span>
              <span className="stats-label">Writes</span>
            </div>
          </div>
        )}

        <div className="login-buttons">
          <button className="btn btn-primary login-btn" onClick={() => navigate('/login')}>
            Get Started
          </button>
        </div>
        <p className="landing-hint">Designed for Claude Code</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rename WorkspaceShell to ProjectShell**

Create `web/src/views/ProjectShell.tsx` based on `WorkspaceShell.tsx`. Key changes:

- Import `ProjectProvider`, `useProject`, `useProjectPath` from `../context/ProjectContext`
- Import `trackProject` from `../lib/projects`
- `useParams()` now extracts `{ account, project }` instead of `{ workspace }`
- `<ProjectProvider accountSlug={account} projectSlug={project}>`
- All `/_/post/` paths → `/post/`, `/_/search` → `/search`, `/_/new` → `/post/new`
- Sidebar title shows `account/project`
- Topic browsing catch-all renders under `browse/*` not `*`

Route structure inside ProjectShell:

```tsx
<Routes>
  <Route path="join" element={<JoinView />} />
  <Route path="*" element={
    <ProjectLayout account={account} project={project} ... />
  } />
</Routes>
```

Inner routes:

```tsx
<Routes>
  <Route path="post/:id/edit" element={<PostEditorView ... />} />
  <Route path="post/:id" element={<PostView ... />} />
  <Route path="post/new" element={<PostEditorView ... />} />
  <Route path="search" element={<SearchView />} />
  <Route path="browse/*" element={<BrowseView ... />} />
  <Route path="" element={<Navigate to="browse/" replace />} />
  <Route path="*" element={<Navigate to="browse/" replace />} />
</Routes>
```

- [ ] **Step 4: Delete old WorkspaceShell**

Run: `rm /home/ubuntu/kilroy/web/src/views/WorkspaceShell.tsx`

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx web/src/views/LandingView.tsx web/src/views/ProjectShell.tsx
git rm web/src/views/WorkspaceShell.tsx
git commit -m "feat: rework app routing with auth, rename WorkspaceShell to ProjectShell"
```

---

## Task 14: Web UI — Update Existing Views

**Files:**
- Modify: `web/src/views/BrowseView.tsx`
- Modify: `web/src/views/PostView.tsx`
- Modify: `web/src/views/SearchView.tsx`
- Modify: `web/src/views/NewPostView.tsx`
- Modify: `web/src/views/JoinView.tsx`
- Modify: `web/src/views/StatsView.tsx`
- Modify: `web/src/components/Omnibar.tsx`
- Modify: `web/src/components/TopicTree.tsx`

This is a bulk update. Every view that uses `useWorkspace()` and `useWorkspacePath()` needs to switch to `useProject()` and `useProjectPath()`. Every API call that passes a single `workspace` string now passes `accountSlug, projectSlug`.

- [ ] **Step 1: Update BrowseView**

- Import `useProject, useProjectPath` from `../context/ProjectContext`
- Replace `useWorkspace()` → `const { accountSlug, projectSlug } = useProject()`
- Replace `useWorkspacePath()` → `useProjectPath()`
- All API calls: `browse(workspace, params)` → `browse(accountSlug, projectSlug, params)`
- `getWorkspaceInfo(workspace)` → `getProjectInfo(accountSlug, projectSlug)`
- Path references: `tp('/_/new...')` → `pp('/post/new...')`, `tp('/_/post/...')` → `pp('/post/...')`
- Topic navigation: `tp('/')` → `pp('/browse/')`, `tp('/topic/')` → `pp('/browse/topic/')`

- [ ] **Step 2: Update PostView**

- Same pattern: `useProject()` + `useProjectPath()`
- `readPost(workspace, id)` → `readPost(accountSlug, projectSlug, id)`
- `createComment(workspace, id, ...)` → `createComment(accountSlug, projectSlug, id, ...)`
- `updateStatus(workspace, id, ...)` → `updateStatus(accountSlug, projectSlug, id, ...)`
- `deletePost(workspace, id)` → `deletePost(accountSlug, projectSlug, id)`
- Path: `tp('/_/post/...')` → `pp('/post/...')`

- [ ] **Step 3: Update SearchView**

- `search(workspace, params)` → `search(accountSlug, projectSlug, params)`
- `tp('/_/post/...')` → `pp('/post/...')`

- [ ] **Step 4: Update NewPostView (PostEditorView)**

- `readPost(workspace, id)` → `readPost(accountSlug, projectSlug, id)`
- `createPost(workspace, payload)` → `createPost(accountSlug, projectSlug, payload)`
- `updatePost(workspace, id, payload)` → `updatePost(accountSlug, projectSlug, id, payload)`
- `tp('/_/post/...')` → `pp('/post/...')`

- [ ] **Step 5: Update JoinView**

Remove the session cookie logic. The join page now simply displays the install command and project key. It no longer calls `joinWorkspace()` — instead it calls the join API endpoint directly.

- Import `useProject` from `../context/ProjectContext`
- Replace all "workspace" copy with "project"
- The join URL validates the token via `/:account/:project/join?token=...` and shows install info
- Remove `trackWorkspace()` call
- Remove "Browse workspace" link (or change to "Browse project" with sign-in prompt)

- [ ] **Step 6: Update StatsView**

- Change `stats.workspaces` → `stats.projects`
- Change label "Workspaces" → "Projects"
- Change copy "Create a workspace" → "Create a project"
- Update stats fetch URL from `/_/api/stats` to `/api/stats`

- [ ] **Step 7: Update Omnibar**

- `useProject()` + `useProjectPath()` instead of workspace equivalents
- All API calls pass `(accountSlug, projectSlug)` instead of `workspace`
- Omnibar path breadcrumb shows `account/project/topic`
- Link to home (`/`) stays the same
- `tp('/_/post/...')` → `pp('/post/...')`
- `tp('/_/search...')` → `pp('/search...')`
- Topic navigation: `tp('/topic/')` → `pp('/browse/topic/')`
- "Invite" button references updated join link
- `getWorkspaceInfo` → `getProjectInfo`

- [ ] **Step 8: Update TopicTree**

- `useProject()` + `useProjectPath()` instead of workspace equivalents
- `browse(workspace, ...)` → `browse(accountSlug, projectSlug, ...)`
- `fetchAllPosts` takes `accountSlug, projectSlug` instead of `workspace`
- Path detection: `/_/post/`, `/_/search`, `/_/new` → `/post/`, `/search/`, `/post/new`
- Navigation: `wp('/_/post/...')` → `pp('/post/...')`
- Navigation: `wp('/topic/')` → `pp('/browse/topic/')`
- `sessionStorage` key: `kilroy:tree:${accountSlug}/${projectSlug}`
- Current topic derivation from URL: prefix is now `/${accountSlug}/${projectSlug}/browse/`

- [ ] **Step 9: Commit**

```bash
git add web/src/views/BrowseView.tsx web/src/views/PostView.tsx web/src/views/SearchView.tsx \
        web/src/views/NewPostView.tsx web/src/views/JoinView.tsx web/src/views/StatsView.tsx \
        web/src/components/Omnibar.tsx web/src/components/TopicTree.tsx
git commit -m "refactor: update all views and components for project context and new URL paths"
```

---

## Task 15: Project Settings Page + Account Menu

**Files:**
- Create: `web/src/views/ProjectSettingsView.tsx`
- Modify: `web/src/views/ProjectShell.tsx` (add route + account menu)

- [ ] **Step 1: Create ProjectSettingsView**

A simple page at `/:account/:project/settings` that shows:
- Project key (copyable, masked by default)
- Install script URL (copyable)
- Regenerate key button (calls `PATCH /api/info` or similar — stretch goal, can be wired later)

Uses `useProject()` + `getProjectInfo(accountSlug, projectSlug)` to fetch the data.

Only accessible to the project owner (the account the project belongs to). Check if `useAuth().account.slug === accountSlug`.

- [ ] **Step 2: Add account menu to ProjectShell**

In the `ProjectLayout` component (inside `ProjectShell.tsx`), add a small account menu in the omnibar area or top-right:
- Show current user's slug
- Link to `/projects`
- Sign out button (calls `useAuth().signOut()`)

- [ ] **Step 3: Add settings route to ProjectShell**

Add to the inner Routes:

```tsx
<Route path="settings" element={<ProjectSettingsView />} />
```

- [ ] **Step 4: Commit**

```bash
git add web/src/views/ProjectSettingsView.tsx web/src/views/ProjectShell.tsx
git commit -m "feat: add project settings page and account menu"
```

---

## Task 16: Plugin Updates

**Files:**
- Modify: `plugin/commands/kilroy.md`
- Delete: `plugin/commands/kilroy-setup.md`
- Delete: `plugin/skills/setup-kilroy/SKILL.md`
- Modify: `plugin/skills/using-kilroy/SKILL.md`

- [ ] **Step 1: Update /kilroy command**

In `plugin/commands/kilroy.md`, replace any references to "workspace" with "project". Remove the line referencing `/kilroy-setup`.

- [ ] **Step 2: Delete kilroy-setup command and skill**

Run:
```bash
rm /home/ubuntu/kilroy/plugin/commands/kilroy-setup.md
rm -rf /home/ubuntu/kilroy/plugin/skills/setup-kilroy
```

- [ ] **Step 3: Update using-kilroy skill**

In `plugin/skills/using-kilroy/SKILL.md`:
- Replace "workspace" with "project" in all copy
- Replace "Workspace" with "Project"
- Update the setup instruction from `/kilroy-setup` to mention the install script
- Update the "If Kilroy tools are failing" message to say "re-run the install script" instead of "run `/kilroy-setup`"

- [ ] **Step 4: Commit**

```bash
git add plugin/commands/kilroy.md plugin/skills/using-kilroy/SKILL.md
git rm plugin/commands/kilroy-setup.md plugin/skills/setup-kilroy/SKILL.md
git commit -m "feat: update plugin copy, remove kilroy-setup command and skill"
```

---

## Task 17: Integration Verification

- [ ] **Step 1: Build check**

Run: `cd /home/ubuntu/kilroy && bun build src/server.ts --no-bundle 2>&1 | tail -20`

Fix any import errors (stale references to `workspaces/registry`, `middleware/workspace`, `WorkspaceContext`, etc.).

- [ ] **Step 2: Web build check**

Run: `cd /home/ubuntu/kilroy/web && bun run build 2>&1 | tail -30`

Fix any TypeScript/React errors.

- [ ] **Step 3: Server startup test**

Ensure required env vars are set (at minimum `DATABASE_URL`, `BETTER_AUTH_SECRET`), then:

Run: `cd /home/ubuntu/kilroy && timeout 5 bun run src/server.ts 2>&1 || true`

Expected: "Kilroy server running on http://localhost:7432" (may exit due to timeout, that's fine).

- [ ] **Step 4: Verify database tables**

Run:
```bash
cd /home/ubuntu/kilroy && bun -e "
import { client } from './src/db';
import { initDatabase } from './src/db';
await initDatabase();
const tables = await client\`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name\`;
console.log('Tables:', tables.map(t => t.table_name));
process.exit(0);
"
```

Expected: Tables include `accounts`, `projects`, `posts`, `comments`, and Better Auth tables (`ba_user`, `ba_session`, `ba_account`).

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve import and build issues from accounts migration"
```
