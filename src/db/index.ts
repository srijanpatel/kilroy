import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import * as authSchema from "./auth-schema";

const DATABASE_URL = process.env.DATABASE_URL || "postgres://kilroy:kilroy@localhost:5432/kilroy";

export const client = postgres(DATABASE_URL, {
  idle_timeout: 20,       // close idle connections after 20s (before NAT/RDS drops them)
  max_lifetime: 60 * 5,   // refresh connections every 5 minutes
  connect_timeout: 10,    // fail fast on connection errors
});
export const db = drizzle(client, { schema: { ...schema, ...authSchema } });

export async function initDatabase() {
  // Suppress "relation already exists, skipping" NOTICEs from IF NOT EXISTS statements
  await client.unsafe(`SET client_min_messages TO warning`);

  // Better Auth tables (ba_ prefix)
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS ba_user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      image TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ba_session (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ba_account (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      access_token_expires_at TIMESTAMPTZ,
      refresh_token_expires_at TIMESTAMPTZ,
      scope TEXT,
      id_token TEXT,
      password TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ba_verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
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
      project_key TEXT UNIQUE,
      invite_token TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(account_id, slug)
    );
  `);

  // Migration: add invite_token column to existing projects tables
  await client.unsafe(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;
  `);

  // Migration: rename workspace_id -> project_id in posts and comments
  const [postsHasWorkspaceId] = await client.unsafe(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'workspace_id'
  `);
  if (postsHasWorkspaceId) {
    await client.unsafe(`ALTER TABLE posts RENAME COLUMN workspace_id TO project_id`);
  }
  const [commentsHasWorkspaceId] = await client.unsafe(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments' AND column_name = 'workspace_id'
  `);
  if (commentsHasWorkspaceId) {
    await client.unsafe(`ALTER TABLE comments RENAME COLUMN workspace_id TO project_id`);
  }

  // Migration: fix FK constraints that still reference old workspaces table
  const fksToFix = await client.unsafe(`
    SELECT conname, conrelid::regclass::text AS tbl
    FROM pg_constraint
    WHERE conrelid::regclass::text IN ('posts', 'comments')
    AND contype = 'f'
    AND pg_get_constraintdef(oid) LIKE '%REFERENCES workspaces%'
  `);
  for (const fk of fksToFix) {
    await client.unsafe(`ALTER TABLE ${fk.tbl} DROP CONSTRAINT ${fk.conname}`);
    await client.unsafe(`ALTER TABLE ${fk.tbl} ADD CONSTRAINT ${fk.tbl}_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id)`);
  }

  // Create project_members table
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS project_members (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      member_key TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(project_id, account_id)
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
      author_account_id TEXT REFERENCES accounts(id),
      author_type TEXT NOT NULL DEFAULT 'agent',
      author_metadata TEXT,
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
      author_account_id TEXT REFERENCES accounts(id),
      author_type TEXT NOT NULL DEFAULT 'agent',
      author_metadata TEXT,
      search_vector TSVECTOR,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Migration: add new author columns
  await client.unsafe(`
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_account_id TEXT REFERENCES accounts(id);
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_type TEXT NOT NULL DEFAULT 'agent';
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_metadata TEXT;

    ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_account_id TEXT REFERENCES accounts(id);
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_type TEXT NOT NULL DEFAULT 'agent';
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_metadata TEXT;
  `);

  // Migration: make topic nullable (tags-only migration)
  await client.unsafe(`ALTER TABLE posts ALTER COLUMN topic DROP NOT NULL`);

  // Migration: backfill tags from topic segments (one-time, idempotent)
  await client.unsafe(`
    UPDATE posts
    SET tags = (
      SELECT jsonb_agg(DISTINCT t)::text
      FROM (
        SELECT jsonb_array_elements_text(
          CASE WHEN tags IS NOT NULL AND tags != ''
            THEN tags::jsonb ELSE '[]'::jsonb END
        ) AS t
        UNION
        SELECT unnest(string_to_array(topic, '/')) AS t
      ) sub
      WHERE t IS NOT NULL AND t != ''
    )
    WHERE topic IS NOT NULL AND topic != ''
  `);

  // Migration: drop topic index (no longer used)
  await client.unsafe(`DROP INDEX IF EXISTS idx_posts_project_topic`);

  // Indexes
  await client.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_posts_project_id ON posts(project_id);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_updated_at ON posts(updated_at);
    CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_posts_search ON posts USING GIN(search_vector);
    CREATE INDEX IF NOT EXISTS idx_comments_search ON comments USING GIN(search_vector);
    CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_members_account ON project_members(account_id);
    CREATE INDEX IF NOT EXISTS idx_project_members_key ON project_members(member_key);
  `);

  // Full-text search triggers for posts
  await client.unsafe(`
    CREATE OR REPLACE FUNCTION posts_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english',
          CASE WHEN NEW.tags IS NOT NULL AND NEW.tags != ''
            THEN array_to_string(ARRAY(
              SELECT jsonb_array_elements_text(NEW.tags::jsonb)
            ), ' ')
            ELSE ''
          END), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.body, '')), 'B');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS posts_search_vector_trigger ON posts;
    CREATE TRIGGER posts_search_vector_trigger
      BEFORE INSERT OR UPDATE OF title, body, tags ON posts
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

  // OAuth Provider Plugin tables (JWT + OAuth 2.1)
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS ba_jwks (
      id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS ba_oauth_client (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL UNIQUE,
      client_secret TEXT,
      disabled BOOLEAN DEFAULT false,
      skip_consent BOOLEAN,
      enable_end_session BOOLEAN,
      subject_type TEXT,
      scopes TEXT[],
      user_id TEXT REFERENCES ba_user(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      name TEXT,
      uri TEXT,
      icon TEXT,
      contacts TEXT[],
      tos TEXT,
      policy TEXT,
      software_id TEXT,
      software_version TEXT,
      software_statement TEXT,
      redirect_uris TEXT[] NOT NULL,
      post_logout_redirect_uris TEXT[],
      token_endpoint_auth_method TEXT,
      grant_types TEXT[],
      response_types TEXT[],
      public BOOLEAN,
      type TEXT,
      require_pkce BOOLEAN,
      reference_id TEXT,
      metadata JSONB
    );

    CREATE TABLE IF NOT EXISTS ba_oauth_refresh_token (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      client_id TEXT NOT NULL REFERENCES ba_oauth_client(client_id) ON DELETE CASCADE,
      session_id TEXT REFERENCES ba_session(id) ON DELETE SET NULL,
      user_id TEXT NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,
      reference_id TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked TIMESTAMPTZ,
      auth_time TIMESTAMPTZ,
      scopes TEXT[] NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ba_oauth_access_token (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL REFERENCES ba_oauth_client(client_id) ON DELETE CASCADE,
      session_id TEXT REFERENCES ba_session(id) ON DELETE SET NULL,
      user_id TEXT REFERENCES ba_user(id) ON DELETE CASCADE,
      reference_id TEXT,
      refresh_id TEXT REFERENCES ba_oauth_refresh_token(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      scopes TEXT[] NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ba_oauth_consent (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES ba_oauth_client(client_id) ON DELETE CASCADE,
      user_id TEXT REFERENCES ba_user(id) ON DELETE CASCADE,
      reference_id TEXT,
      scopes TEXT[] NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Run sharing model migration (idempotent)
  const { migrateSharingModel } = await import("./migrate-sharing");
  await migrateSharingModel();

  // Restore default notice level for runtime queries
  await client.unsafe(`SET client_min_messages TO notice`);
}
