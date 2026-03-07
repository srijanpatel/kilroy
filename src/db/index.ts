import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const DB_PATH = process.env.HEARSAY_DB_PATH || "hearsay.db";

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };

export function initDatabase() {
  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      tags TEXT,
      body TEXT NOT NULL,
      author TEXT,
      files TEXT,
      commit_sha TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      author TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_posts_topic ON posts(topic);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_updated_at ON posts(updated_at);
    CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at);
  `);

  // FTS5 virtual tables for full-text search (content-storing, not contentless)
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
      post_id UNINDEXED,
      title,
      body,
      tokenize='porter unicode61'
    );
  `);

  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS comments_fts USING fts5(
      comment_id UNINDEXED,
      post_id UNINDEXED,
      body,
      tokenize='porter unicode61'
    );
  `);
}
