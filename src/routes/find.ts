import { Hono } from "hono";
import { client } from "../db";
import type { Env } from "../types";

export const findRouter = new Hono<Env>();

findRouter.get("/", async (c) => {
  const author = c.req.query("author");
  const tags = c.req.queries("tag") || [];
  const since = c.req.query("since");
  const before = c.req.query("before");
  const status = c.req.query("status") || "active";
  const topic = c.req.query("topic");
  const orderBy = c.req.query("order_by") || "updated_at";
  const order = c.req.query("order") || "desc";
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "20"), 1), 100);
  const cursor = c.req.query("cursor");

  // Require at least one filter (topic counts as a filter)
  const hasFilter = author || tags.length > 0 || since || before || topic;
  if (!hasFilter) {
    return c.json(
      { error: "At least one filter is required. Use kilroy ls for unfiltered listing.", code: "INVALID_INPUT" },
      400
    );
  }

  const workspaceId = c.get("workspaceId");

  // Build SQL query — always scoped to workspace
  const conditions: string[] = ["workspace_id = $1"];
  const params: any[] = [workspaceId];
  let paramIdx = 2;

  if (author) {
    conditions.push(`author = $${paramIdx++}`);
    params.push(author);
  }

  if (since) {
    conditions.push(`updated_at >= $${paramIdx++}`);
    params.push(since);
  }

  if (before) {
    conditions.push(`updated_at <= $${paramIdx++}`);
    params.push(before);
  }

  if (status !== "all") {
    conditions.push(`status = $${paramIdx++}`);
    params.push(status);
  }

  if (topic) {
    conditions.push(`(topic = $${paramIdx} OR topic LIKE $${paramIdx + 1})`);
    params.push(topic, `${topic}/%`);
    paramIdx += 2;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Sort
  const sortCol = orderBy === "created_at" ? "created_at" : orderBy === "title" ? "title" : "updated_at";
  const sortDir = order === "asc" ? "ASC" : "DESC";

  const query = `SELECT * FROM posts ${where} ORDER BY ${sortCol} ${sortDir}, id ${sortDir}`;
  let rows = await client.unsafe(query, params) as any[];

  // Post-query filters (tags, file) — these require JSON parsing
  if (tags.length > 0) {
    rows = rows.filter((p: any) => {
      const postTags: string[] = p.tags ? JSON.parse(p.tags) : [];
      return tags.every((t) => postTags.includes(t));
    });
  }

  // Cursor-based pagination (offset style for simplicity)
  let startIdx = 0;
  if (cursor) {
    startIdx = parseInt(cursor) || 0;
  }

  const paged = rows.slice(startIdx, startIdx + limit);
  const hasMore = startIdx + limit < rows.length;

  const results = paged.map((row: any) => ({
    id: row.id,
    title: row.title,
    topic: row.topic,
    status: row.status,
    tags: row.tags ? JSON.parse(row.tags) : [],
    author: row.author,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }));

  const response: any = { results };
  if (hasMore) {
    response.next_cursor = String(startIdx + limit);
    response.has_more = true;
  }

  return c.json(response);
});
