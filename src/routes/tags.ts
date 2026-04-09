import { Hono } from "hono";
import { client } from "../db";
import type { Env } from "../types";

export const tagsRouter = new Hono<Env>();

tagsRouter.get("/", async (c) => {
  const projectId = c.get("projectId");
  const status = c.req.query("status") || "active";
  const filterTags = c.req.query("tags")?.split(",").map((t) => t.trim()).filter(Boolean) || [];

  let statusCondition = "";
  const params: any[] = [projectId];

  if (status !== "all") {
    params.push(status);
    statusCondition = `AND status = $${params.length}`;
  }

  if (filterTags.length > 0) {
    // Faceted drill-down: find tags that co-occur with the filter tags
    const tagConditions = filterTags.map((tag) => {
      params.push(tag);
      return `tags::jsonb ? $${params.length}`;
    }).join(" AND ");

    const rows = await client.unsafe(`
      WITH filtered_posts AS (
        SELECT id, tags
        FROM posts
        WHERE project_id = $1
          ${statusCondition}
          AND tags IS NOT NULL AND tags != ''
          AND ${tagConditions}
      )
      SELECT tag, count(*)::int as count
      FROM filtered_posts, jsonb_array_elements_text(tags::jsonb) AS tag
      WHERE tag != ALL($${params.length + 1}::text[])
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `, [...params, filterTags]);

    return c.json({ tags: rows });
  }

  // No filter: return all tags with counts
  const rows = await client.unsafe(`
    SELECT tag, count(*)::int as count
    FROM posts, jsonb_array_elements_text(tags::jsonb) AS tag
    WHERE project_id = $1
      ${statusCondition}
      AND tags IS NOT NULL AND tags != ''
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `, params);

  return c.json({ tags: rows });
});
