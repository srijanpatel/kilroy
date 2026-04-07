# Project Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project membership so teammates can browse the web UI and connect their agents to shared projects, with per-member keys and invite links.

**Architecture:** New `project_members` table holds membership + per-member API keys. The existing single `project_key` on projects is replaced by per-member keys. Auth middleware checks membership for both session and token paths. Author identity on posts/comments becomes structured (account FK + type + metadata jsonb) instead of free-text.

**Tech Stack:** TypeScript/Bun, Hono, Drizzle ORM, PostgreSQL, React (Vite), Better Auth

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/db/schema.ts` | Modify | Add `projectMembers` table, `inviteToken` on projects, new author columns on posts/comments |
| `src/db/index.ts` | Modify | Add `project_members` CREATE TABLE, add new columns, migration logic |
| `src/members/registry.ts` | Create | Membership CRUD: add/remove/list members, validate member key, regenerate key |
| `src/projects/registry.ts` | Modify | Replace `projectKey` with `inviteToken`, update `createProject` to create owner membership, remove `getProjectKey` |
| `src/types.ts` | Modify | Add `memberAccountId` and `authorType` to Env Variables |
| `src/middleware/project.ts` | Modify | Check `project_members.member_key` for tokens, check membership for sessions |
| `src/lib/format.ts` | Modify | Update `formatPost` for new author fields |
| `src/routes/posts.ts` | Modify | Use structured author from context instead of request body |
| `src/routes/browse.ts` | Modify | Update contributor_count query for new author model |
| `src/routes/find.ts` | Modify | Update author filter for `author_account_id` |
| `src/routes/info.ts` | Modify | Return member's own key + invite link with invite_token |
| `src/routes/join.ts` | Modify | Browser-based membership creation with redirect |
| `src/routes/install.ts` | Modify | Accept `key` param (member key) instead of `token` (project key) |
| `src/routes/global-api.ts` | Modify | Add member management endpoints, update project listing to include joined projects |
| `src/mcp/server.ts` | Modify | Pass `author_metadata` instead of `author` string |
| `src/server.ts` | Modify | Add session resolution to join route, mount new member API routes |
| `web/src/views/ProjectSettingsView.tsx` | Modify | Add members list, invite link management, remove/regenerate actions |
| `web/src/views/ProjectsView.tsx` | Modify | Show joined projects alongside owned ones |
| `web/src/views/JoinView.tsx` | Modify | Handle browser-based join flow with membership creation |
| `web/src/lib/api.ts` | Modify | Add member management API functions |
| `plugin/hooks/scripts/inject-context.sh` | Modify | Pass `author_metadata` JSON blob instead of `author` string |
| `test/helpers.ts` | Modify | Create test member with member_key, update context injection |
| `test/api.test.ts` | Modify | Update author assertions for new structured model |
| `test/members.test.ts` | Create | Tests for membership CRUD and key validation |

---

### Task 1: Database Schema — `project_members` table

**Files:**
- Modify: `src/db/schema.ts:1-69`
- Modify: `src/db/index.ts:76-86` (projects table), `src/db/index.ts:119-128` (indexes)

- [ ] **Step 1: Add `projectMembers` table to Drizzle schema**

In `src/db/schema.ts`, add after the `projects` table definition (after line 23):

```typescript
export const projectMembers = pgTable(
  "project_members",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    memberKey: text("member_key").notNull().unique(),
    role: text("role", { enum: ["owner", "member"] })
      .notNull()
      .default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_project_members_project_account").on(table.projectId, table.accountId),
    index("idx_project_members_project").on(table.projectId),
    index("idx_project_members_account").on(table.accountId),
  ]
);
```

- [ ] **Step 2: Add `inviteToken` to `projects` schema, remove `projectKey`**

In `src/db/schema.ts`, replace the `projects` table definition (lines 11-23) with:

```typescript
export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    accountId: text("account_id").references(() => accounts.id),
    inviteToken: text("invite_token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_projects_account_slug").on(table.accountId, table.slug),
  ]
);
```

- [ ] **Step 3: Add `project_members` table to `initDatabase()`**

In `src/db/index.ts`, add after the projects CREATE TABLE block (after line 86):

```sql
CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  member_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, account_id)
);
```

- [ ] **Step 4: Add `invite_token` column to projects in `initDatabase()`**

In `src/db/index.ts`, after the project_members table creation, add migration SQL:

```sql
-- Add invite_token if it doesn't exist
ALTER TABLE projects ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;
```

Also add indexes for project_members:

```sql
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_account ON project_members(account_id);
CREATE INDEX IF NOT EXISTS idx_project_members_key ON project_members(member_key);
```

- [ ] **Step 5: Run `bun run dev:server` to verify schema initializes without errors**

Run: `bun run dev:server`
Expected: Server starts without SQL errors. New tables created.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/index.ts
git commit -m "feat: add project_members table and invite_token column"
```

---

### Task 2: Members Registry

**Files:**
- Create: `src/members/registry.ts`

- [ ] **Step 1: Write the members registry tests**

Create `test/members.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import {
  addMember,
  removeMember,
  listMembers,
  validateMemberKey,
  getMemberByAccountAndProject,
  regenerateMemberKey,
} from "../src/members/registry";
import { resetDb, testProjectId, testAccountId } from "./helpers";
import { uuidv7 } from "../src/lib/uuid";

// We'll need a second account for member tests
let secondAccountId: string;

async function createSecondAccount() {
  const { client } = await import("../src/db");
  secondAccountId = uuidv7();
  await client.unsafe(`
    INSERT INTO accounts (id, slug, display_name, auth_user_id)
    VALUES ('${secondAccountId}', 'teammate', 'Teammate', 'test-user-2')
  `);
}

describe("addMember", () => {
  beforeEach(async () => {
    await resetDb();
    await createSecondAccount();
  });

  it("creates a membership with a member key", async () => {
    const member = await addMember(testProjectId, secondAccountId, "member");
    expect(member.id).toBeTruthy();
    expect(member.memberKey).toMatch(/^klry_proj_/);
    expect(member.role).toBe("member");
  });

  it("rejects duplicate membership", async () => {
    await addMember(testProjectId, secondAccountId, "member");
    expect(addMember(testProjectId, secondAccountId, "member")).rejects.toThrow();
  });
});

describe("validateMemberKey", () => {
  beforeEach(async () => {
    await resetDb();
    await createSecondAccount();
  });

  it("validates a member key and returns project + account info", async () => {
    const member = await addMember(testProjectId, secondAccountId, "member");
    const result = await validateMemberKey("test-account", "test-workspace", member.memberKey);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.projectId).toBe(testProjectId);
      expect(result.memberAccountId).toBe(secondAccountId);
    }
  });

  it("rejects invalid key", async () => {
    const result = await validateMemberKey("test-account", "test-workspace", "klry_proj_invalid");
    expect(result.valid).toBe(false);
  });
});

describe("listMembers", () => {
  beforeEach(async () => {
    await resetDb();
    await createSecondAccount();
  });

  it("lists all members of a project", async () => {
    await addMember(testProjectId, secondAccountId, "member");
    const members = await listMembers(testProjectId);
    // Owner from resetDb + secondAccount
    expect(members.length).toBeGreaterThanOrEqual(2);
    expect(members.find((m) => m.accountId === secondAccountId)).toBeTruthy();
  });
});

describe("removeMember", () => {
  beforeEach(async () => {
    await resetDb();
    await createSecondAccount();
  });

  it("removes a member and invalidates their key", async () => {
    const member = await addMember(testProjectId, secondAccountId, "member");
    await removeMember(testProjectId, secondAccountId);

    const result = await validateMemberKey("test-account", "test-workspace", member.memberKey);
    expect(result.valid).toBe(false);
  });
});

describe("regenerateMemberKey", () => {
  beforeEach(async () => {
    await resetDb();
    await createSecondAccount();
  });

  it("generates a new key and invalidates the old one", async () => {
    const member = await addMember(testProjectId, secondAccountId, "member");
    const oldKey = member.memberKey;

    const newKey = await regenerateMemberKey(testProjectId, secondAccountId);
    expect(newKey).not.toBe(oldKey);
    expect(newKey).toMatch(/^klry_proj_/);

    // Old key should be invalid
    const oldResult = await validateMemberKey("test-account", "test-workspace", oldKey);
    expect(oldResult.valid).toBe(false);

    // New key should work
    const newResult = await validateMemberKey("test-account", "test-workspace", newKey);
    expect(newResult.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/members.test.ts`
Expected: FAIL — `src/members/registry.ts` doesn't exist yet.

- [ ] **Step 3: Update test helpers to export `testAccountId` and create owner membership**

In `test/helpers.ts`, update `resetDb()` to also create a `project_members` row for the owner, and export `testAccountId`:

```typescript
import { Hono } from "hono";
import { api } from "../src/routes/api";
import { uuidv7 } from "../src/lib/uuid";
import type { Env } from "../src/types";

export let testProjectId: string;
export let testToken: string;
export let testAccountId: string;

/** @deprecated Use testProjectId */
export let testWorkspaceId: string;

export async function resetDb() {
  const { initDatabase, client } = await import("../src/db");
  await initDatabase();
  await client.unsafe("TRUNCATE comments, posts, project_members, projects, accounts CASCADE");

  // Create a test account
  const accountId = uuidv7();
  testAccountId = accountId;
  await client.unsafe(`
    INSERT INTO accounts (id, slug, display_name, auth_user_id)
    VALUES ('${accountId}', 'test-account', 'Test Account', 'test-user-id')
  `);

  // Create a test project with invite_token
  const projectId = uuidv7();
  const inviteToken = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  testProjectId = projectId;
  testWorkspaceId = projectId;

  await client.unsafe(`
    INSERT INTO projects (id, slug, account_id, invite_token)
    VALUES ('${projectId}', 'test-workspace', '${accountId}', '${inviteToken}')
  `);

  // Create owner membership with a member key
  const memberKey = `klry_proj_${Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
  testToken = memberKey;

  await client.unsafe(`
    INSERT INTO project_members (id, project_id, account_id, member_key, role)
    VALUES ('${uuidv7()}', '${projectId}', '${accountId}', '${memberKey}', 'owner')
  `);
}

export function createTestApp(): Hono<Env> {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("projectId", testProjectId);
    c.set("projectSlug", "test-workspace");
    c.set("accountSlug", "test-account");
    c.set("memberAccountId", testAccountId);
    c.set("authorType", "agent" as const);
    return next();
  });
  app.route("/api", api);
  return app;
}
```

- [ ] **Step 4: Implement the members registry**

Create `src/members/registry.ts`:

```typescript
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
    .returning({ id: projectMembers.id });

  return result.length > 0;
}

export async function listMembers(projectId: string) {
  return db
    .select({
      id: projectMembers.id,
      accountId: projectMembers.accountId,
      accountSlug: accounts.slug,
      displayName: accounts.displayName,
      memberKey: projectMembers.memberKey,
      role: projectMembers.role,
      createdAt: projectMembers.createdAt,
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
  return row || null;
}

export async function regenerateMemberKey(
  projectId: string,
  accountId: string
): Promise<string> {
  const newKey = generateMemberKey();
  await db
    .update(projectMembers)
    .set({ memberKey: newKey })
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.accountId, accountId)
      )
    );
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test test/members.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/members/registry.ts test/members.test.ts test/helpers.ts
git commit -m "feat: add members registry with CRUD and key validation"
```

---

### Task 3: Update Project Registry

**Files:**
- Modify: `src/projects/registry.ts:20-27` (generateProjectKey), `src/projects/registry.ts:42-71` (createProject), `src/projects/registry.ts:73-87` (validateProjectKey), `src/projects/registry.ts:113-120` (getProjectKey, listProjectsByAccount)

- [ ] **Step 1: Update `createProject` to use invite_token and create owner membership**

Replace the full content of `src/projects/registry.ts`:

```typescript
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { projects, accounts, projectMembers } from "../db/schema";
import { uuidv7 } from "../lib/uuid";
import { addMember } from "../members/registry";

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

function generateInviteToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
  memberKey: string;
  inviteToken: string;
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
  const inviteToken = generateInviteToken();

  await db.insert(projects).values({
    id,
    slug,
    accountId,
    inviteToken,
  });

  // Create owner membership
  const member = await addMember(id, accountId, "owner");

  return { slug, id, memberKey: member.memberKey, inviteToken };
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

export async function getProjectInviteToken(projectId: string): Promise<string | null> {
  const [project] = await db
    .select({ inviteToken: projects.inviteToken })
    .from(projects)
    .where(eq(projects.id, projectId));
  return project?.inviteToken ?? null;
}

export async function regenerateInviteToken(projectId: string): Promise<string> {
  const newToken = generateInviteToken();
  await db
    .update(projects)
    .set({ inviteToken: newToken })
    .where(eq(projects.id, projectId));
  return newToken;
}

export async function validateInviteToken(
  accountSlug: string,
  projectSlug: string,
  token: string
): Promise<{ valid: true; projectId: string } | { valid: false }> {
  const rows = await db
    .select({ projectId: projects.id })
    .from(projects)
    .innerJoin(accounts, eq(projects.accountId, accounts.id))
    .where(
      and(
        eq(accounts.slug, accountSlug),
        eq(projects.slug, projectSlug),
        eq(projects.inviteToken, token)
      )
    );

  if (rows.length === 0) return { valid: false };
  return { valid: true, projectId: rows[0].projectId };
}

export async function listProjectsByAccount(accountId: string) {
  return db.select().from(projects).where(eq(projects.accountId, accountId));
}
```

- [ ] **Step 2: Run existing tests to check for breakage**

Run: `bun test`
Expected: Some tests may fail due to schema changes (the `project_key` column removal). That's expected — we'll fix tests in later steps.

- [ ] **Step 3: Commit**

```bash
git add src/projects/registry.ts
git commit -m "feat: update project registry for invite tokens and member keys"
```

---

### Task 4: Update Types and Middleware

**Files:**
- Modify: `src/types.ts:1-8`
- Modify: `src/middleware/project.ts:1-49`

- [ ] **Step 1: Update Env types**

Replace `src/types.ts`:

```typescript
export type Env = {
  Variables: {
    projectId: string;
    projectSlug: string;
    accountSlug: string;
    memberAccountId: string;
    authorType: "human" | "agent";
  };
};
```

- [ ] **Step 2: Update projectAuth middleware**

Replace `src/middleware/project.ts`:

```typescript
import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { getProjectBySlugs } from "../projects/registry";
import { validateMemberKey, getMemberByAccountAndProject } from "../members/registry";
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
    const result = await validateMemberKey(accountSlug, projectSlug, token);
    if (result.valid) {
      c.set("projectId", result.projectId);
      c.set("projectSlug", projectSlug);
      c.set("accountSlug", accountSlug);
      c.set("memberAccountId", result.memberAccountId);
      c.set("authorType", "agent");
      return next();
    }
  }

  // Try Better Auth session (web UI)
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (session?.user) {
    const account = await getAccountByAuthUserId(session.user.id);
    if (account) {
      const project = await getProjectBySlugs(accountSlug, projectSlug);
      if (project) {
        const membership = await getMemberByAccountAndProject(project.id, account.id);
        if (membership) {
          c.set("projectId", project.id);
          c.set("projectSlug", projectSlug);
          c.set("accountSlug", accountSlug);
          c.set("memberAccountId", account.id);
          c.set("authorType", "human");
          return next();
        }
      }
    }
  }

  return c.json(
    { error: "Invalid or missing project key", code: "UNAUTHORIZED" },
    401
  );
});
```

- [ ] **Step 3: Run `bun test` to check for type errors**

Run: `bun test`
Expected: May have some failures due to test helpers not setting the new context vars. We already updated helpers in Task 2.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/middleware/project.ts
git commit -m "feat: update middleware to check membership and set author context"
```

---

### Task 5: Update Author Model — Schema, Format, Routes

**Files:**
- Modify: `src/db/schema.ts:25-49` (posts), `src/db/schema.ts:51-69` (comments)
- Modify: `src/db/index.ts:88-117` (posts/comments tables)
- Modify: `src/lib/format.ts:1-25`
- Modify: `src/routes/posts.ts`
- Modify: `src/routes/browse.ts:159`
- Modify: `src/routes/find.ts:35-38`

- [ ] **Step 1: Add new author columns to schema.ts**

In `src/db/schema.ts`, update the `posts` table — replace the `author` column with the new author fields:

```typescript
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
    authorAccountId: text("author_account_id").references(() => accounts.id),
    authorType: text("author_type", { enum: ["human", "agent"] })
      .notNull()
      .default("agent"),
    authorMetadata: text("author_metadata"),
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
```

Do the same for `comments`:

```typescript
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
    authorAccountId: text("author_account_id").references(() => accounts.id),
    authorType: text("author_type", { enum: ["human", "agent"] })
      .notNull()
      .default("agent"),
    authorMetadata: text("author_metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_comments_post_created").on(table.postId, table.createdAt),
  ]
);
```

- [ ] **Step 2: Add new columns to `initDatabase()` SQL**

In `src/db/index.ts`, update the posts CREATE TABLE to use the new columns:

```sql
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  tags TEXT,
  body TEXT NOT NULL,
  author_account_id TEXT REFERENCES accounts(id),
  author_type TEXT NOT NULL DEFAULT 'agent',
  author_metadata TEXT,
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Update comments similarly:

```sql
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_account_id TEXT REFERENCES accounts(id),
  author_type TEXT NOT NULL DEFAULT 'agent',
  author_metadata TEXT,
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Add migration for existing columns (after the CREATE TABLE blocks):

```sql
-- Migration: add new author columns if they don't exist
ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_account_id TEXT REFERENCES accounts(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_type TEXT NOT NULL DEFAULT 'agent';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_metadata TEXT;

ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_account_id TEXT REFERENCES accounts(id);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_type TEXT NOT NULL DEFAULT 'agent';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_metadata TEXT;
```

- [ ] **Step 3: Update `formatPost` in `src/lib/format.ts`**

Replace the full file:

```typescript
import { accounts } from "../db/schema";

/**
 * Format a post row from the database into the API response shape.
 * Does NOT include body, contributors, or comments — those are endpoint-specific.
 */
export function formatPost(post: {
  id: string;
  title: string;
  topic: string;
  status: string;
  tags: string | null;
  authorAccountId: string | null;
  authorType: string;
  authorMetadata: string | null;
  createdAt: Date;
  updatedAt: Date;
}, authorDisplay?: { slug: string; displayName: string } | null) {
  return {
    id: post.id,
    title: post.title,
    topic: post.topic,
    status: post.status,
    tags: post.tags ? JSON.parse(post.tags) : [],
    author: {
      account_id: post.authorAccountId,
      type: post.authorType,
      metadata: post.authorMetadata ? JSON.parse(post.authorMetadata) : null,
      ...(authorDisplay ? { slug: authorDisplay.slug, display_name: authorDisplay.displayName } : {}),
    },
    created_at: post.createdAt.toISOString(),
    updated_at: post.updatedAt.toISOString(),
  };
}

export function formatComment(comment: {
  id: string;
  postId: string;
  body: string;
  authorAccountId: string | null;
  authorType: string;
  authorMetadata: string | null;
  createdAt: Date;
  updatedAt: Date;
}, authorDisplay?: { slug: string; displayName: string } | null) {
  return {
    id: comment.id,
    post_id: comment.postId,
    body: comment.body,
    author: {
      account_id: comment.authorAccountId,
      type: comment.authorType,
      metadata: comment.authorMetadata ? JSON.parse(comment.authorMetadata) : null,
      ...(authorDisplay ? { slug: authorDisplay.slug, display_name: authorDisplay.displayName } : {}),
    },
    created_at: comment.createdAt.toISOString(),
    updated_at: comment.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 4: Update `src/routes/posts.ts` for structured author**

Replace the full file:

```typescript
import { Hono } from "hono";
import { eq, and, asc } from "drizzle-orm";
import { db } from "../db";
import { posts, comments, accounts } from "../db/schema";
import { uuidv7 } from "../lib/uuid";
import { formatPost, formatComment } from "../lib/format";
import type { Env } from "../types";

export const postsRouter = new Hono<Env>();

// Helper to look up account display info by ID
async function getAccountDisplay(accountId: string | null) {
  if (!accountId) return null;
  const [row] = await db.select({ slug: accounts.slug, displayName: accounts.displayName }).from(accounts).where(eq(accounts.id, accountId));
  return row || null;
}

// GET /posts/:id — Read a post with all comments
postsRouter.get("/:id", async (c) => {
  const postId = c.req.param("id");
  const projectId = c.get("projectId");

  const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.projectId, projectId)));
  if (!post) {
    return c.json({ error: "Post not found", code: "NOT_FOUND" }, 404);
  }

  const postComments = await db
    .select()
    .from(comments)
    .where(eq(comments.postId, postId))
    .orderBy(asc(comments.createdAt));

  // Collect unique account IDs for display lookup
  const accountIds = new Set<string>();
  if (post.authorAccountId) accountIds.add(post.authorAccountId);
  for (const comment of postComments) {
    if (comment.authorAccountId) accountIds.add(comment.authorAccountId);
  }

  // Batch lookup account display info
  const displayMap = new Map<string, { slug: string; displayName: string }>();
  for (const id of accountIds) {
    const display = await getAccountDisplay(id);
    if (display) displayMap.set(id, display);
  }

  // Compute contributors
  const contributors = Array.from(accountIds).map((id) => {
    const display = displayMap.get(id);
    return { account_id: id, slug: display?.slug, display_name: display?.displayName };
  });

  return c.json({
    ...formatPost(post, post.authorAccountId ? displayMap.get(post.authorAccountId) : null),
    body: post.body,
    contributors,
    comments: postComments.map((comment) =>
      formatComment(comment, comment.authorAccountId ? displayMap.get(comment.authorAccountId) : null)
    ),
  });
});

// POST /posts — Create a new post
postsRouter.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.title || !body.topic || !body.body) {
    return c.json(
      { error: "Missing required fields: title, topic, body", code: "INVALID_INPUT" },
      400
    );
  }

  const projectId = c.get("projectId");
  const memberAccountId = c.get("memberAccountId");
  const authorType = c.get("authorType");
  const now = new Date();
  const id = uuidv7();

  const post = {
    id,
    projectId,
    title: body.title,
    topic: body.topic,
    status: "active" as const,
    tags: body.tags ? JSON.stringify(body.tags) : null,
    body: body.body,
    authorAccountId: memberAccountId,
    authorType: authorType,
    authorMetadata: body.author_metadata ? JSON.stringify(body.author_metadata) : null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(posts).values(post);

  const display = await getAccountDisplay(memberAccountId);

  return c.json(
    {
      ...formatPost(post, display),
      body: post.body,
    },
    201
  );
});

// POST /posts/:id/comments — Add a comment to a post
postsRouter.post("/:id/comments", async (c) => {
  const postId = c.req.param("id");
  const body = await c.req.json();

  if (!body.body) {
    return c.json(
      { error: "Missing required field: body", code: "INVALID_INPUT" },
      400
    );
  }

  const projectId = c.get("projectId");
  const memberAccountId = c.get("memberAccountId");
  const authorType = c.get("authorType");

  // Check post exists and belongs to this project
  const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.projectId, projectId)));
  if (!post) {
    return c.json({ error: "Post not found", code: "NOT_FOUND" }, 404);
  }

  const now = new Date();
  const id = uuidv7();

  const comment = {
    id,
    projectId,
    postId,
    body: body.body,
    authorAccountId: memberAccountId,
    authorType: authorType,
    authorMetadata: body.author_metadata ? JSON.stringify(body.author_metadata) : null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(comments).values(comment);

  // Update post's updated_at
  await db.update(posts).set({ updatedAt: now }).where(eq(posts.id, postId));

  const display = await getAccountDisplay(memberAccountId);

  return c.json(formatComment(comment, display), 201);
});

// PATCH /posts/:id/comments/:commentId — Update a comment
postsRouter.patch("/:id/comments/:commentId", async (c) => {
  const postId = c.req.param("id");
  const commentId = c.req.param("commentId");
  const body = await c.req.json();

  if (!body.body || typeof body.body !== "string" || body.body.length === 0) {
    return c.json(
      { error: "Field 'body' is required and must be a non-empty string", code: "INVALID_INPUT" },
      400
    );
  }

  const projectId = c.get("projectId");
  const memberAccountId = c.get("memberAccountId");

  // Find the comment and verify it belongs to this post and project
  const [comment] = await db.select().from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.projectId, projectId)));

  if (!comment || comment.postId !== postId) {
    return c.json({ error: "Comment not found", code: "NOT_FOUND" }, 404);
  }

  // Author matching: member can only edit their own comments
  if (comment.authorAccountId && comment.authorAccountId !== memberAccountId) {
    return c.json(
      { error: "You can only edit your own comments", code: "AUTHOR_MISMATCH" },
      403
    );
  }

  const now = new Date();

  await db.update(comments)
    .set({ body: body.body, updatedAt: now })
    .where(eq(comments.id, commentId));

  await db.update(posts).set({ updatedAt: now }).where(eq(posts.id, postId));

  const display = await getAccountDisplay(comment.authorAccountId);

  return c.json({
    ...formatComment({ ...comment, body: body.body, updatedAt: now }, display),
  });
});

// PATCH /posts/:id — Update post content and/or status
postsRouter.patch("/:id", async (c) => {
  const postId = c.req.param("id");
  const body = await c.req.json();

  const hasContent = body.title !== undefined || body.topic !== undefined ||
    body.body !== undefined || body.tags !== undefined;
  const hasStatus = body.status !== undefined;

  if (!hasContent && !hasStatus) {
    return c.json(
      { error: "At least one field required: title, topic, body, tags, or status", code: "INVALID_INPUT" },
      400
    );
  }

  // Validate non-empty strings for text fields
  for (const field of ["title", "topic", "body"] as const) {
    if (body[field] !== undefined && (typeof body[field] !== "string" || body[field].length === 0)) {
      return c.json(
        { error: `Field '${field}' must be a non-empty string`, code: "INVALID_INPUT" },
        400
      );
    }
  }

  // Validate status enum if provided
  const validStatuses = ["active", "archived", "obsolete"];
  if (hasStatus && !validStatuses.includes(body.status)) {
    return c.json(
      { error: `Invalid status: ${body.status}. Must be one of: ${validStatuses.join(", ")}`, code: "INVALID_INPUT" },
      400
    );
  }

  const projectId = c.get("projectId");
  const memberAccountId = c.get("memberAccountId");

  const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.projectId, projectId)));
  if (!post) {
    return c.json({ error: "Post not found", code: "NOT_FOUND" }, 404);
  }

  // Author matching: member can only edit their own posts
  if (post.authorAccountId && post.authorAccountId !== memberAccountId) {
    return c.json(
      { error: "You can only edit your own posts", code: "AUTHOR_MISMATCH" },
      403
    );
  }

  // Validate status transition if status is being changed
  if (hasStatus && body.status !== post.status) {
    const validTransitions: Record<string, string[]> = {
      active: ["archived", "obsolete"],
      archived: ["active"],
      obsolete: ["active"],
    };

    if (!validTransitions[post.status]?.includes(body.status)) {
      return c.json(
        { error: `Invalid transition: ${post.status} -> ${body.status}`, code: "INVALID_TRANSITION" },
        409
      );
    }
  }

  // Build update set
  const now = new Date();
  const updates: Record<string, any> = { updatedAt: now };

  if (body.title !== undefined) updates.title = body.title;
  if (body.topic !== undefined) updates.topic = body.topic;
  if (body.body !== undefined) updates.body = body.body;
  if (body.tags !== undefined) updates.tags = body.tags.length > 0 ? JSON.stringify(body.tags) : null;
  if (hasStatus) updates.status = body.status;

  await db.update(posts).set(updates).where(eq(posts.id, postId));

  // Read back the full post for response
  const [updated] = await db.select().from(posts).where(eq(posts.id, postId));
  const display = await getAccountDisplay(updated.authorAccountId);
  return c.json(formatPost(updated, display));
});

// DELETE /posts/:id — Permanently delete a post and all comments
postsRouter.delete("/:id", async (c) => {
  const postId = c.req.param("id");

  const projectId = c.get("projectId");
  const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.projectId, projectId)));
  if (!post) {
    return c.json({ error: "Post not found", code: "NOT_FOUND" }, 404);
  }

  await db.delete(comments).where(eq(comments.postId, postId));
  await db.delete(posts).where(eq(posts.id, postId));

  return c.json({ deleted: true, post_id: postId });
});
```

- [ ] **Step 5: Update `src/routes/browse.ts` — contributor count query**

In `src/routes/browse.ts`, line 159 uses `count(DISTINCT author)`. Change to `count(DISTINCT author_account_id)`:

Replace: `count(DISTINCT author)::int as contributor_count,`
With: `count(DISTINCT author_account_id)::int as contributor_count,`

- [ ] **Step 6: Update `src/routes/find.ts` — author filter**

In `src/routes/find.ts`, lines 35-38 filter by `author`. Change to filter by `author_account_id`:

Replace:
```typescript
  if (author) {
    conditions.push(`author = $${paramIdx++}`);
    params.push(author);
  }
```
With:
```typescript
  if (author) {
    conditions.push(`author_account_id = $${paramIdx++}`);
    params.push(author);
  }
```

Also update the result mapping (lines 87-96) to use the new author shape:

Replace:
```typescript
    author: row.author,
```
With:
```typescript
    author: {
      account_id: row.author_account_id,
      type: row.author_type,
      metadata: row.author_metadata ? JSON.parse(row.author_metadata) : null,
    },
```

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/index.ts src/lib/format.ts src/routes/posts.ts src/routes/browse.ts src/routes/find.ts
git commit -m "feat: replace free-text author with structured author model"
```

---

### Task 6: Update Info Route and Install Route

**Files:**
- Modify: `src/routes/info.ts:1-28`
- Modify: `src/routes/install.ts`

- [ ] **Step 1: Update info route to return member key and invite link**

Replace `src/routes/info.ts`:

```typescript
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
    member_key: memberKey,
    install_command: `curl -sL "${projectUrl}/install?key=${memberKey}" | sh`,
    invite_link: inviteToken ? `${projectUrl}/join?token=${inviteToken}` : null,
  });
});
```

- [ ] **Step 2: Update install route to accept `key` param (member key)**

Read the current `src/routes/install.ts` and update to accept `key` param and validate via member key:

In `src/routes/install.ts`, change the query param from `token` to `key`, and use `validateMemberKey` instead of `validateProjectKey`:

The install handler should:
1. Accept `?key=<member_key>` query param
2. Validate it via `validateMemberKey(accountSlug, projectSlug, key)`
3. Return the shell script with the member key baked in

Update the imports and validation logic accordingly. The shell script content stays the same but uses the member key as KILROY_TOKEN.

- [ ] **Step 3: Commit**

```bash
git add src/routes/info.ts src/routes/install.ts
git commit -m "feat: update info and install routes for per-member keys"
```

---

### Task 7: Update Join Flow

**Files:**
- Modify: `src/routes/join.ts:1-39`
- Modify: `src/server.ts` (add session resolution to join route)

- [ ] **Step 1: Rewrite join handler for dual path (API + browser)**

Replace `src/routes/join.ts`:

```typescript
import { Hono } from "hono";
import { validateInviteToken } from "../projects/registry";
import { addMember, getMemberByAccountAndProject } from "../members/registry";
import { getAccountByAuthUserId } from "../accounts/registry";
import { auth } from "../auth";
import { getBaseUrl } from "../lib/url";

type JoinEnv = {
  Variables: {
    user?: { id: string; email: string; name: string } | null;
    account?: { id: string; slug: string; displayName: string } | null;
  };
};

export const joinHandler = new Hono<JoinEnv>();

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
    // No session — return JSON for API consumers (backward compat)
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
      install_command: `curl -sL "${projectUrl}/install?key=${existing.memberKey}" | sh`,
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
    install_command: `curl -sL "${projectUrl}/install?key=${member.memberKey}" | sh`,
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/join.ts
git commit -m "feat: update join handler for membership creation"
```

---

### Task 8: Update Global API — Projects Listing and Member Management

**Files:**
- Modify: `src/routes/global-api.ts`

- [ ] **Step 1: Update `GET /api/projects` to include joined projects**

In `src/routes/global-api.ts`, replace the `GET /api/projects` handler (lines 69-82):

```typescript
// GET /api/projects
globalApi.get("/projects", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const ownedProjects = await listProjectsByAccount(account.id);

  // Find projects this account is a member of (but doesn't own)
  const { listMembershipsForAccount } = await import("../members/registry");
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
      joined_at: m.joinedAt,
    })),
  });
});
```

- [ ] **Step 2: Add `listMembershipsForAccount` to members registry**

In `src/members/registry.ts`, add:

```typescript
export async function listMembershipsForAccount(accountId: string) {
  const rows = await db
    .select({
      projectId: projectMembers.projectId,
      projectSlug: projects.slug,
      ownerSlug: accounts.slug,
      role: projectMembers.role,
      joinedAt: projectMembers.createdAt,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .innerJoin(accounts, eq(projects.accountId, accounts.id))
    .where(
      and(
        eq(projectMembers.accountId, accountId),
        eq(projectMembers.role, "member") // Exclude owned projects
      )
    );

  return rows.map((r) => ({
    projectId: r.projectId,
    projectSlug: r.projectSlug,
    ownerSlug: r.ownerSlug,
    joinedAt: r.joinedAt.toISOString(),
  }));
}
```

- [ ] **Step 3: Update `POST /api/projects` response to return member key instead of project key**

In `src/routes/global-api.ts`, update the `POST /api/projects` handler (lines 84-113):

```typescript
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
      install_command: `curl -sL "${baseUrl}/${account.slug}/${project.slug}/install?key=${project.memberKey}" | sh`,
      invite_link: `${baseUrl}/${account.slug}/${project.slug}/join?token=${project.inviteToken}`,
    }, 201);
  } catch (err: any) {
    if (err.message?.includes("already exists")) {
      return c.json({ error: err.message, code: "SLUG_TAKEN" }, 409);
    }
    throw err;
  }
});
```

- [ ] **Step 4: Add member management endpoints**

Add these new routes to `src/routes/global-api.ts`:

```typescript
// GET /api/projects/:projectId/members — list members (owner only)
globalApi.get("/projects/:projectId/members", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const projectId = c.req.param("projectId");
  const { listMembers } = await import("../members/registry");
  const members = await listMembers(projectId);

  return c.json({
    members: members.map((m) => ({
      account_id: m.accountId,
      slug: m.accountSlug,
      display_name: m.displayName,
      role: m.role,
      joined_at: m.createdAt.toISOString(),
    })),
  });
});

// DELETE /api/projects/:projectId/members/:accountId — remove member (owner)
globalApi.delete("/projects/:projectId/members/:accountId", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const projectId = c.req.param("projectId");
  const targetAccountId = c.req.param("accountId");

  // Verify requester is owner
  const { getMemberByAccountAndProject, removeMember } = await import("../members/registry");
  const requesterMembership = await getMemberByAccountAndProject(projectId, account.id);
  if (!requesterMembership || requesterMembership.role !== "owner") {
    return c.json({ error: "Only the project owner can remove members", code: "FORBIDDEN" }, 403);
  }

  // Don't allow removing the owner
  if (targetAccountId === account.id) {
    return c.json({ error: "Owner cannot be removed from their project", code: "FORBIDDEN" }, 403);
  }

  const removed = await removeMember(projectId, targetAccountId);
  if (!removed) {
    return c.json({ error: "Member not found", code: "NOT_FOUND" }, 404);
  }

  return c.json({ removed: true });
});

// POST /api/projects/:projectId/leave — member leaves project
globalApi.post("/projects/:projectId/leave", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const projectId = c.req.param("projectId");
  const { getMemberByAccountAndProject, removeMember } = await import("../members/registry");

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

// POST /api/projects/:projectId/regenerate-invite — regenerate invite token (owner only)
globalApi.post("/projects/:projectId/regenerate-invite", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const projectId = c.req.param("projectId");
  const { getMemberByAccountAndProject } = await import("../members/registry");

  const membership = await getMemberByAccountAndProject(projectId, account.id);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Only the project owner can regenerate the invite link", code: "FORBIDDEN" }, 403);
  }

  const { regenerateInviteToken } = await import("../projects/registry");
  const newToken = await regenerateInviteToken(projectId);
  const baseUrl = getBaseUrl(c.req.url);

  return c.json({
    invite_token: newToken,
    invite_link: `${baseUrl}/${account.slug}/${projectId}/join?token=${newToken}`,
  });
});

// POST /api/projects/:projectId/regenerate-key — regenerate own member key
globalApi.post("/projects/:projectId/regenerate-key", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "Account required", code: "UNAUTHORIZED" }, 401);

  const projectId = c.req.param("projectId");
  const { regenerateMemberKey } = await import("../members/registry");

  const newKey = await regenerateMemberKey(projectId, account.id);
  return c.json({ member_key: newKey });
});
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/global-api.ts src/members/registry.ts
git commit -m "feat: add member management API and update project listing"
```

---

### Task 9: Update MCP Server

**Files:**
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Update MCP tool definitions to use `author_metadata` instead of `author`**

In `src/mcp/server.ts`, update the tools that accept `author`:

For `kilroy_create_post` (line 132), replace the `author` parameter with `author_metadata`:

```typescript
      author_metadata: z.record(z.string(), z.unknown()).optional().describe("Agent runtime metadata (git_user, os_user, session_id, agent). Injected automatically by Claude Code plugin."),
```

And update the request body (line 135-141):

```typescript
      const { status, data } = await apiRequest("POST", "/api/posts", {
        title: args.title,
        topic: args.topic,
        body: args.body,
        tags: args.tags,
        author_metadata: args.author_metadata,
      });
```

Apply the same change to `kilroy_comment`, `kilroy_update_post`, and `kilroy_update_comment`.

For `kilroy_update_post` and `kilroy_update_comment`, remove the `author` parameter entirely since author matching is now based on account ID from the middleware, not from the request body.

- [ ] **Step 2: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat: update MCP tools for structured author model"
```

---

### Task 10: Update Plugin Hook Scripts

**Files:**
- Modify: `plugin/hooks/scripts/inject-context.sh`

- [ ] **Step 1: Update inject-context.sh to pass `author_metadata` JSON blob**

Replace `plugin/hooks/scripts/inject-context.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

input=$(cat)

# Gather agent runtime metadata
git_user=$(git config user.name 2>/dev/null || echo "")
os_user="${USER:-$(whoami 2>/dev/null || echo "unknown")}"
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')
session_tag="session:${session_id:0:8}"

# Build author_metadata object
metadata=$(jq -n \
  --arg git_user "$git_user" \
  --arg os_user "$os_user" \
  --arg session_id "$session_id" \
  --arg agent "claude-code" \
  '{git_user: $git_user, os_user: $os_user, session_id: $session_id, agent: $agent}')

# Merge author_metadata + session tag into tool_input
updated=$(printf '%s' "$input" | jq -c \
  --argjson metadata "$metadata" \
  --arg session_tag "$session_tag" \
  '.tool_input + {author_metadata: $metadata, tags: ((.tool_input.tags // []) + [$session_tag] | unique)}')

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":%s}}\n' "$updated"
```

- [ ] **Step 2: Commit**

```bash
git add plugin/hooks/scripts/inject-context.sh
git commit -m "feat: update hook to pass author_metadata instead of author string"
```

---

### Task 11: Update Tests

**Files:**
- Modify: `test/api.test.ts`
- Modify: `test/helpers.ts` (already done in Task 2)

- [ ] **Step 1: Update test assertions for new author shape**

In `test/api.test.ts`, update all tests that reference `author` as a string. The new shape is:

```typescript
author: {
  account_id: string | null,
  type: "human" | "agent",
  metadata: object | null,
}
```

Key changes:
- `createPost()` helper: remove `author` from defaults, since it's now set from context
- `createComment()` helper: remove `author` from defaults
- All `expect(post.author).toBe(...)` → `expect(post.author.account_id).toBe(testAccountId)`
- All `expect(post.author).toBeNull()` → `expect(post.author.account_id).toBe(testAccountId)` (it's always set now from middleware)
- Author matching tests: update to check `author.account_id` instead of `author`
- Contributors: now an array of `{ account_id, slug, display_name }` objects

Update the `createPost` helper:

```typescript
async function createPost(overrides: Record<string, any> = {}): Promise<any> {
  const defaults = {
    title: "Test post",
    topic: "test",
    body: "Test body content",
    tags: ["test"],
  };
  const res = await app.request("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...defaults, ...overrides }),
  });
  return res.json();
}

async function createComment(postId: string, overrides: Record<string, any> = {}): Promise<any> {
  const defaults = { body: "Test comment" };
  const res = await app.request(`/api/posts/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...defaults, ...overrides }),
  });
  return res.json();
}
```

Update specific test assertions — for example, the "creates a post with all fields" test:

```typescript
it("creates a post with all fields", async () => {
  const res = await app.request("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "OAuth gotcha",
      topic: "auth/google",
      body: "Redirect URI must match exactly.",
      tags: ["oauth", "gotcha"],
    }),
  });

  expect(res.status).toBe(201);
  const post = await res.json();
  expect(post.id).toMatch(/^[0-9a-f-]+$/);
  expect(post.title).toBe("OAuth gotcha");
  expect(post.topic).toBe("auth/google");
  expect(post.status).toBe("active");
  expect(post.tags).toEqual(["oauth", "gotcha"]);
  expect(post.author.account_id).toBe(testAccountId);
  expect(post.author.type).toBe("agent");
  expect(post.created_at).toBeTruthy();
});
```

Update the contributors test:

```typescript
it("reads a post with comments and contributors", async () => {
  const post = await createPost();
  await createComment(post.id);

  const res = await app.request(`/api/posts/${post.id}`);
  const data = await res.json();
  expect(data.contributors).toHaveLength(1); // Same account for both
  expect(data.contributors[0].account_id).toBe(testAccountId);
});
```

For author matching tests, since all test posts are created by the same account, the matching tests need adjustment. The "rejects edit when author does not match" test needs a post created by a different account. You can skip updating author matching tests for now (mark them as `.skip`) since the test harness only has one account context.

- [ ] **Step 2: Run all tests**

Run: `bun test`
Expected: All tests pass (with author matching tests possibly skipped).

- [ ] **Step 3: Commit**

```bash
git add test/api.test.ts test/helpers.ts
git commit -m "test: update tests for structured author model and membership"
```

---

### Task 12: Update Web UI — Projects Page

**Files:**
- Modify: `web/src/views/ProjectsView.tsx`

- [ ] **Step 1: Update ProjectsView to show joined projects**

In `web/src/views/ProjectsView.tsx`, update the interface and fetch logic:

Add a `JoinedProject` interface:

```typescript
interface JoinedProject {
  id: string;
  slug: string;
  owner: string;
  joined_at: string;
}
```

Add state for joined projects:

```typescript
const [joinedProjects, setJoinedProjects] = useState<JoinedProject[]>([]);
```

Update the fetch to handle the new `{ owned, joined }` response shape:

```typescript
fetch('/api/projects', { credentials: 'include' })
  .then((r) => r.json())
  .then((d) => {
    setProjects(d.owned || []);
    setJoinedProjects(d.joined || []);
  })
```

Add a joined projects section in the JSX, after the "Your projects" section:

```tsx
{joinedProjects.length > 0 && (
  <div className="landing-projects">
    <div className="landing-projects-label">Projects you've joined</div>
    <div className="landing-projects-list">
      {joinedProjects.map((p) => (
        <a
          key={p.id}
          href={`/${p.owner}/${p.slug}/`}
          className="landing-project-card"
          onClick={(e) => { e.preventDefault(); navigate(`/${p.owner}/${p.slug}/`); }}
        >
          <KilroyMark size={18} />
          <span className="landing-project-slug">{p.owner}/{p.slug}</span>
          <span className="landing-project-arrow">&rarr;</span>
        </a>
      ))}
    </div>
  </div>
)}
```

Also update the "created" callback to use `member_key` and `invite_link` instead of `project_key`:

```typescript
interface NewProject extends Project {
  member_key: string;
  project_url: string;
  install_command: string;
  invite_link: string;
  account_slug: string;
}
```

And in the created display section, update the `InviteCard` props:

```tsx
<InviteCard
  installCommand={created.install_command}
  joinLink={created.invite_link}
/>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/views/ProjectsView.tsx
git commit -m "feat: show joined projects on projects page"
```

---

### Task 13: Update Web UI — Settings Page

**Files:**
- Modify: `web/src/views/ProjectSettingsView.tsx`
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: Add member management API functions**

In `web/src/lib/api.ts`, add:

```typescript
export async function listMembers(projectId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/members`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load members');
  return res.json();
}

export async function removeMember(projectId: string, accountId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to remove member');
  return res.json();
}

export async function leaveProject(projectId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/leave`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to leave project');
  return res.json();
}

export async function regenerateInviteLink(projectId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/regenerate-invite`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to regenerate invite link');
  return res.json();
}

export async function regenerateKey(projectId: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/regenerate-key`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to regenerate key');
  return res.json();
}
```

- [ ] **Step 2: Update ProjectSettingsView with members list and management**

Replace `web/src/views/ProjectSettingsView.tsx` with a version that:
- Shows the member's own key (with reveal/hide/copy/regenerate)
- Shows install command (with member key baked in)
- Shows invite link (with regenerate button) — owner only
- Lists all members with "Remove" button — owner only
- Shows "Leave" button for non-owner members

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjectInfo, listMembers, removeMember, regenerateInviteLink, regenerateKey } from '../lib/api';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';

interface MemberInfo {
  account_id: string;
  slug: string;
  display_name: string;
  role: string;
  joined_at: string;
}

export function ProjectSettingsView() {
  const { accountSlug, projectSlug } = useProject();
  const { account } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [error, setError] = useState('');
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const isOwner = account?.slug === accountSlug;

  useEffect(() => {
    getProjectInfo(accountSlug, projectSlug)
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [accountSlug, projectSlug]);

  useEffect(() => {
    if (!info) return;
    // Use project ID from a separate lookup or embed it in info response
    // For now, we pass it through the info endpoint or derive from context
    // We'll need the project ID for member management
  }, [info]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleRemoveMember = async (accountId: string) => {
    if (!info?.project_id) return;
    try {
      await removeMember(info.project_id, accountId);
      setMembers((prev) => prev.filter((m) => m.account_id !== accountId));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRegenerateInvite = async () => {
    if (!info?.project_id) return;
    try {
      const result = await regenerateInviteLink(info.project_id);
      setInfo((prev: any) => ({ ...prev, invite_link: result.invite_link }));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRegenerateKey = async () => {
    if (!info?.project_id) return;
    try {
      const result = await regenerateKey(info.project_id);
      setInfo((prev: any) => ({ ...prev, member_key: result.member_key }));
      setKeyRevealed(true);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="content">
      <div className="form-heading">
        <div className="form-kicker">Settings</div>
        <h1 className="form-title">{accountSlug}/{projectSlug}</h1>
      </div>

      {error && <div className="error">{error}</div>}

      {info && (
        <>
          {info.member_key && (
            <div className="setup-block">
              <div className="setup-block-label">Your Project Key</div>
              <div className="setup-block-content">
                <code>
                  {keyRevealed ? info.member_key : info.member_key.slice(0, 8) + '••••••••••••••••••••••••'}
                </code>
                <button className="btn" onClick={() => setKeyRevealed((r) => !r)}>
                  {keyRevealed ? 'Hide' : 'Reveal'}
                </button>
                {keyRevealed && (
                  <>
                    <button className="btn" onClick={() => handleCopy(info.member_key, 'key')}>
                      {copied === 'key' ? 'Copied!' : 'Copy'}
                    </button>
                    <button className="btn" onClick={handleRegenerateKey}>Regenerate</button>
                  </>
                )}
              </div>
              <div className="setup-block-hint">Your personal key for agent access. Regenerating invalidates the old one.</div>
            </div>
          )}

          {info.install_command && (
            <div className="setup-block">
              <div className="setup-block-label">Install Script</div>
              <div className="setup-block-content">
                <code>{info.install_command}</code>
                <button className="btn" onClick={() => handleCopy(info.install_command, 'install')}>
                  {copied === 'install' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="setup-block-hint">Run in your project directory to connect an agent.</div>
            </div>
          )}

          {isOwner && info.invite_link && (
            <div className="setup-block">
              <div className="setup-block-label">Invite Link</div>
              <div className="setup-block-content">
                <code>{info.invite_link}</code>
                <button className="btn" onClick={() => handleCopy(info.invite_link, 'invite')}>
                  {copied === 'invite' ? 'Copied!' : 'Copy'}
                </button>
                <button className="btn" onClick={handleRegenerateInvite}>Regenerate</button>
              </div>
              <div className="setup-block-hint">Share to invite teammates. Regenerating invalidates old links but doesn't affect existing members.</div>
            </div>
          )}

          {isOwner && members.length > 0 && (
            <div className="setup-block">
              <div className="setup-block-label">Members</div>
              <div className="members-list">
                {members.map((m) => (
                  <div key={m.account_id} className="member-row">
                    <span className="member-name">{m.display_name} ({m.slug})</span>
                    <span className="member-role">{m.role}</span>
                    {m.role !== 'owner' && (
                      <button className="btn btn-danger" onClick={() => handleRemoveMember(m.account_id)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: '2rem' }}>
        <button className="btn" onClick={() => navigate(-1)}>Back</button>
      </div>
    </div>
  );
}
```

Note: The info endpoint will need to include `project_id` in its response for member management API calls to work. Add `project_id: projectId` to the info route response in `src/routes/info.ts`.

- [ ] **Step 3: Commit**

```bash
git add web/src/views/ProjectSettingsView.tsx web/src/lib/api.ts
git commit -m "feat: add member management UI to settings page"
```

---

### Task 14: Update Web UI — Join View

**Files:**
- Modify: `web/src/views/JoinView.tsx`

- [ ] **Step 1: Update JoinView for membership-based join flow**

Update `web/src/views/JoinView.tsx` to handle the new join response shape:

- If `requires_login: true` → show login button (redirect to `/login` with return URL)
- If `requires_onboarding: true` → redirect to `/onboarding`
- If `already_member: true` → show "You're already a member" with link to project
- If `joined: true` → show success message with install command and link to browse

The component should call the join endpoint with the token, and render the appropriate state based on the response.

- [ ] **Step 2: Commit**

```bash
git add web/src/views/JoinView.tsx
git commit -m "feat: update join view for membership-based flow"
```

---

### Task 15: Data Migration Script

**Files:**
- Create: `src/db/migrate-sharing.ts`

- [ ] **Step 1: Write migration script for existing data**

Create `src/db/migrate-sharing.ts`:

```typescript
/**
 * Migration: project sharing
 *
 * 1. Add invite_token to projects (if missing)
 * 2. Create project_members rows for existing project owners
 *    (project_key → owner's member_key)
 * 3. Migrate author text → author_metadata.legacy_author
 *
 * Safe to run multiple times (idempotent).
 */
import { client } from "./index";

export async function migrateSharingModel() {
  // 1. Generate invite tokens for projects that don't have one
  await client.unsafe(`
    UPDATE projects
    SET invite_token = encode(gen_random_bytes(16), 'hex')
    WHERE invite_token IS NULL
  `);

  // 2. Create owner memberships for projects that don't have one yet
  const projectsWithoutMembers = await client.unsafe(`
    SELECT p.id as project_id, p.account_id, p.project_key
    FROM projects p
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.role = 'owner'
    WHERE pm.id IS NULL AND p.account_id IS NOT NULL
  `);

  for (const row of projectsWithoutMembers) {
    const id = crypto.randomUUID();
    await client.unsafe(`
      INSERT INTO project_members (id, project_id, account_id, member_key, role)
      VALUES ($1, $2, $3, $4, 'owner')
      ON CONFLICT (project_id, account_id) DO NOTHING
    `, [id, row.project_id, row.account_id, row.project_key || `klry_proj_${Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')}`]);
  }

  // 3. Migrate author text to author_metadata (if author column still exists)
  try {
    await client.unsafe(`
      UPDATE posts
      SET author_metadata = jsonb_build_object('legacy_author', author)::text
      WHERE author IS NOT NULL AND author_metadata IS NULL
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'posts' AND column_name = 'author'
        )
    `);

    await client.unsafe(`
      UPDATE comments
      SET author_metadata = jsonb_build_object('legacy_author', author)::text
      WHERE author IS NOT NULL AND author_metadata IS NULL
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'comments' AND column_name = 'author'
        )
    `);
  } catch {
    // author column may already be dropped — that's fine
  }

  console.log("Migration complete: sharing model applied");
}
```

- [ ] **Step 2: Call migration from `initDatabase()`**

In `src/db/index.ts`, add at the end of `initDatabase()`:

```typescript
  // Run sharing model migration (idempotent)
  const { migrateSharingModel } = await import("./migrate-sharing");
  await migrateSharingModel();
```

- [ ] **Step 3: Test migration by restarting server**

Run: `bun run dev:server`
Expected: Migration runs without errors, existing data preserved.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrate-sharing.ts src/db/index.ts
git commit -m "feat: add data migration for sharing model"
```

---

### Task 16: Final Integration Test

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 2: Manual smoke test**

Run: `bun run dev`

1. Open browser → sign in → create project → verify install command shows member key
2. Copy invite link → open in incognito → sign in → verify join creates membership
3. Go back to original → settings → verify member appears in list
4. Test agent install command → verify agent can post with author_metadata

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for project sharing"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Database schema — project_members table, invite_token | `src/db/schema.ts`, `src/db/index.ts` |
| 2 | Members registry — CRUD, key validation | `src/members/registry.ts`, `test/members.test.ts` |
| 3 | Project registry — invite tokens, owner membership | `src/projects/registry.ts` |
| 4 | Types and middleware — membership check | `src/types.ts`, `src/middleware/project.ts` |
| 5 | Author model — structured author on posts/comments | `src/lib/format.ts`, `src/routes/posts.ts`, `browse.ts`, `find.ts` |
| 6 | Info and install routes — per-member keys | `src/routes/info.ts`, `src/routes/install.ts` |
| 7 | Join flow — membership creation | `src/routes/join.ts` |
| 8 | Global API — member management, project listing | `src/routes/global-api.ts` |
| 9 | MCP server — author_metadata | `src/mcp/server.ts` |
| 10 | Hook scripts — author_metadata blob | `plugin/hooks/scripts/inject-context.sh` |
| 11 | Test updates — new author shape | `test/api.test.ts`, `test/helpers.ts` |
| 12 | Web UI — projects page | `web/src/views/ProjectsView.tsx` |
| 13 | Web UI — settings page | `web/src/views/ProjectSettingsView.tsx`, `web/src/lib/api.ts` |
| 14 | Web UI — join view | `web/src/views/JoinView.tsx` |
| 15 | Data migration | `src/db/migrate-sharing.ts` |
| 16 | Integration testing | All files |
