import { pgTable, text, index, timestamp } from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  projectKey: text("project_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    title: text("title").notNull(),
    topic: text("topic").notNull(),
    status: text("status", { enum: ["active", "archived", "obsolete"] })
      .notNull()
      .default("active"),
    tags: text("tags"), // JSON array of strings
    body: text("body").notNull(),
    author: text("author"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_posts_workspace_id").on(table.workspaceId),
    index("idx_posts_workspace_topic").on(table.workspaceId, table.topic),
    index("idx_posts_status").on(table.status),
    index("idx_posts_updated_at").on(table.updatedAt),
  ]
);

export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
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
