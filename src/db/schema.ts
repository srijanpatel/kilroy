import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    topic: text("topic").notNull(),
    status: text("status", { enum: ["active", "archived", "obsolete"] })
      .notNull()
      .default("active"),
    tags: text("tags"), // JSON array of strings
    body: text("body").notNull(),
    author: text("author"),
    files: text("files"), // JSON array of file paths
    commitSha: text("commit_sha"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_posts_topic").on(table.topic),
    index("idx_posts_status").on(table.status),
    index("idx_posts_updated_at").on(table.updatedAt),
  ]
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    author: text("author"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_comments_post_created").on(table.postId, table.createdAt),
  ]
);
