import { Hono } from "hono";
import { eq, asc, sql } from "drizzle-orm";
import { db } from "../db";
import { posts, comments, accounts } from "../db/schema";
import { zipSync, strToU8 } from "fflate";
import type { Env } from "../types";

export const exportRouter = new Hono<Env>();

exportRouter.get("/", async (c) => {
  const projectId = c.get("projectId");

  // Fetch all posts for this project
  const allPosts = await db
    .select()
    .from(posts)
    .where(eq(posts.projectId, projectId))
    .orderBy(asc(posts.topic), asc(posts.title));

  if (allPosts.length === 0) {
    return c.json({ error: "No posts to export", code: "EMPTY_PROJECT" }, 404);
  }

  // Fetch all comments for this project, ordered by creation time
  const allComments = await db
    .select()
    .from(comments)
    .where(eq(comments.projectId, projectId))
    .orderBy(asc(comments.createdAt));

  // Collect unique author account IDs
  const accountIds = new Set<string>();
  for (const p of allPosts) if (p.authorAccountId) accountIds.add(p.authorAccountId);
  for (const cm of allComments) if (cm.authorAccountId) accountIds.add(cm.authorAccountId);

  // Batch-fetch account display info
  const displayMap = new Map<string, { slug: string; displayName: string }>();
  if (accountIds.size > 0) {
    const ids = Array.from(accountIds);
    const rows = await db
      .select({ id: accounts.id, slug: accounts.slug, displayName: accounts.displayName })
      .from(accounts)
      .where(sql`${accounts.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
    for (const row of rows) {
      displayMap.set(row.id, { slug: row.slug, displayName: row.displayName });
    }
  }

  // Group comments by post
  const commentsByPost = new Map<string, typeof allComments>();
  for (const comment of allComments) {
    const list = commentsByPost.get(comment.postId) || [];
    list.push(comment);
    commentsByPost.set(comment.postId, list);
  }

  // Build zip file contents
  const files: Record<string, Uint8Array> = {};

  for (const post of allPosts) {
    const postComments = commentsByPost.get(post.id) || [];
    const md = renderPostMarkdown(post, postComments, displayMap);

    const slug = slugify(post.title);
    const dir = post.topic ? `${post.topic}/` : "";
    const basePath = `${dir}${slug}.md`;

    // Deduplicate file names
    let finalPath = basePath;
    let counter = 1;
    while (files[finalPath]) {
      finalPath = `${dir}${slug}-${counter}.md`;
      counter++;
    }

    files[finalPath] = strToU8(md);
  }

  const zipData = zipSync(files);

  return new Response(zipData.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="kilroy-export.zip"`,
    },
  });
});

function renderPostMarkdown(
  post: {
    title: string;
    topic: string | null;
    status: string;
    tags: string | null;
    body: string;
    authorAccountId: string | null;
    authorType: string;
    createdAt: Date;
    updatedAt: Date;
  },
  postComments: Array<{
    body: string;
    authorAccountId: string | null;
    authorType: string;
    createdAt: Date;
  }>,
  displayMap: Map<string, { slug: string; displayName: string }>,
): string {
  const lines: string[] = [];

  // Title
  lines.push(`# ${post.title}`, "");

  // Metadata line
  const author = formatAuthor(post.authorAccountId, post.authorType, displayMap);
  const date = formatDate(post.createdAt);
  let meta = `*${author} · ${post.status} · ${date}*`;
  lines.push(meta);

  // Tags
  const tags: string[] = post.tags ? JSON.parse(post.tags) : [];
  if (tags.length > 0) {
    lines.push(`*Tags: ${tags.join(", ")}*`);
  }

  lines.push("", post.body);

  // Comments
  if (postComments.length > 0) {
    lines.push("", "---", "", "## Comments");

    for (const comment of postComments) {
      const cAuthor = formatAuthor(comment.authorAccountId, comment.authorType, displayMap);
      const cDate = formatDate(comment.createdAt);
      lines.push("", `### ${cAuthor} — ${cDate}`, "", comment.body);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function formatAuthor(
  accountId: string | null,
  authorType: string,
  displayMap: Map<string, { slug: string; displayName: string }>,
): string {
  const display = accountId ? displayMap.get(accountId) : null;
  const name = display?.displayName || display?.slug || "Unknown";
  return `${name} (${authorType})`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "untitled";
}
