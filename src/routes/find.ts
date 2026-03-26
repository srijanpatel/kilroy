import { Hono } from "hono";
import { sqlite } from "../db";

export const findRouter = new Hono();

findRouter.get("/", (c) => {
  const author = c.req.query("author");
  const tags = c.req.queries("tag") || [];
  const since = c.req.query("since");
  const before = c.req.query("before");
  const file = c.req.query("file");
  const commit = c.req.query("commit");
  const status = c.req.query("status") || "active";
  const topic = c.req.query("topic");
  const orderBy = c.req.query("order_by") || "updated_at";
  const order = c.req.query("order") || "desc";
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "20"), 1), 100);
  const cursor = c.req.query("cursor");

  // Require at least one filter (topic counts as a filter)
  const hasFilter = author || tags.length > 0 || since || before || file || commit || topic;
  if (!hasFilter) {
    return c.json(
      { error: "At least one filter is required. Use kilroy ls for unfiltered listing.", code: "INVALID_INPUT" },
      400
    );
  }

  // Build SQL query
  const conditions: string[] = [];
  const params: any[] = [];

  if (author) {
    conditions.push("author = ?");
    params.push(author);
  }

  if (commit) {
    conditions.push("commit_sha = ?");
    params.push(commit);
  }

  if (since) {
    conditions.push("updated_at >= ?");
    params.push(since);
  }

  if (before) {
    conditions.push("updated_at <= ?");
    params.push(before);
  }

  if (status !== "all") {
    conditions.push("status = ?");
    params.push(status);
  }

  if (topic) {
    conditions.push("(topic = ? OR topic LIKE ?)");
    params.push(topic, `${topic}/%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Sort
  const sortCol = orderBy === "created_at" ? "created_at" : orderBy === "title" ? "title" : "updated_at";
  const sortDir = order === "asc" ? "ASC" : "DESC";

  const query = `SELECT * FROM posts ${where} ORDER BY ${sortCol} ${sortDir}, id ${sortDir}`;
  let rows = sqlite.prepare(query).all(...params) as any[];

  // Post-query filters (tags, file) — these require JSON parsing
  if (tags.length > 0) {
    rows = rows.filter((p: any) => {
      const postTags: string[] = p.tags ? JSON.parse(p.tags) : [];
      return tags.every((t) => postTags.includes(t));
    });
  }

  if (file) {
    rows = rows.filter((p: any) => {
      const postFiles: string[] = p.files ? JSON.parse(p.files) : [];
      return postFiles.includes(file);
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
    files: row.files ? JSON.parse(row.files) : [],
    commit_sha: row.commit_sha,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const response: any = { results };
  if (hasMore) {
    response.next_cursor = String(startIdx + limit);
    response.has_more = true;
  }

  return c.json(response);
});
