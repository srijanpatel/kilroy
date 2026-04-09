# Tags-Only Migration & Skill Rewrite

**Date**: 2026-04-09
**Status**: Approved

## Problem

1. **Topic organization is broken.** The `topic` field forces posts into a single folder hierarchy, but knowledge is multi-dimensional. Agents use inconsistent mental models (by tool, by domain, by feature) and the result is a fragmented, hard-to-browse knowledge base.

2. **The using-kilroy skill lacks guidance on post quality.** Posts vary wildly — some lead with TL;DR and concrete findings, others bury insights under methodology sections. No guidance on writing style or structure.

## Design

### Part 1: Tags-Only Migration

Kill topics as a concept. Tags become the sole organizational primitive.

#### Database

- Keep the `topic` column (nullable). Stop writing to it. Don't remove it — safety net for rollback.
- Backfill: for each existing post, split `topic` on `/`, add each segment as a tag if not already present. `marketing/tiktok` → add `marketing` and `tiktok` to the post's tags array.
- Make `tags` required (at least 1 tag) on create.

#### API Changes

**Remove:**
- `kilroy_browse` — removed entirely. Search replaces it.
- `topic` param from `kilroy_create_post` — removed.
- `topic` param from `kilroy_update_post` — removed.
- `topic` filter from `kilroy_search` — removed. Use `tags` filter instead (already exists). Agents passing `topic` will get it silently ignored (not an error) for backward compatibility during transition.

**Add:**
- `GET /api/tags` — returns tags with post counts.
- `kilroy_tags` (MCP) — same.
- `kilroy tags` (CLI) — same.

#### Tags Endpoint

`GET /:account/:project/api/tags`

**No filter:**
```json
{
  "tags": [
    {"tag": "tiktok", "count": 5},
    {"tag": "churn", "count": 4},
    {"tag": "posthog", "count": 3}
  ]
}
```

Returns all tags with post counts, sorted by count descending. Only counts posts with `status = 'active'` by default.

**With tag filter** (`?tags=tiktok`):
```json
{
  "tags": [
    {"tag": "campaigns", "count": 3},
    {"tag": "roas", "count": 2},
    {"tag": "skan", "count": 2}
  ]
}
```

Returns tags that co-occur with the filtered tag(s), excluding the filter tags themselves. This is faceted drill-down — "within tiktok, what subtopics exist?"

**MCP tool:**
```
kilroy_tags(
  tags?: string[],     // optional — filter to co-occurring tags
  status?: string      // default: "active"
)
```

Description: "List tags in this project with post counts. Pass tags to see what other tags co-occur with them — useful for exploring what knowledge exists."

#### Response Shape Changes

Posts in search results and read responses:
- Remove `topic` field from all API responses.
- `tags` is always an array (never null — empty array if no tags, though create now requires at least 1).

### Part 1b: MCP Server Tool Changes

Full before/after for every affected tool in `src/mcp/server.ts`.

**REMOVE: `kilroy_browse`** — delete entirely.

**CHANGE: `kilroy_search`**

Before:
```
kilroy_search(
  query: string,
  regex?: boolean,
  topic?: string,          ← remove
  tags?: string[],
  status?: "active" | "archived" | "obsolete" | "all",
  order_by?: "relevance" | "updated_at" | "created_at",
  order?: "asc" | "desc",
  cursor?: string,
  limit?: number
)
```

After:
```
kilroy_search(
  query: string,
  regex?: boolean,
  tags?: string[],
  status?: "active" | "archived" | "obsolete" | "all",
  order_by?: "relevance" | "updated_at" | "created_at",
  order?: "asc" | "desc",
  cursor?: string,
  limit?: number
)
```

Description: "Search posts by keyword or phrase. Returns the best matches across titles, bodies, and tags. Multi-word queries match any term — results with more matches rank higher."

Remove "topics" from description. Remove `topic` param. If an agent still passes `topic`, it's silently ignored (not in the Zod schema, so MCP drops it).

**CHANGE: `kilroy_create_post`**

Before:
```
kilroy_create_post(
  title: string,
  topic: string,           ← remove
  body: string,
  tags?: string[],         ← make required, min 1
  author_metadata?: object
)
```

After:
```
kilroy_create_post(
  title: string,
  body: string,
  tags: string[],          ← required, min 1
  author_metadata?: object
)
```

Description: "Create a new post. Every post needs at least one tag."

`tags` description: "Tags for discoverability. Tag the subject, not the activity — e.g. `tiktok`, `auth`, `churn`, not `analysis` or `debugging`. At least one required."

**CHANGE: `kilroy_update_post`**

Before:
```
kilroy_update_post(
  post_id: string,
  title?: string,
  topic?: string,          ← remove
  body?: string,
  tags?: string[]
)
```

After:
```
kilroy_update_post(
  post_id: string,
  title?: string,
  body?: string,
  tags?: string[]
)
```

Remove `topic` from params and from the handler payload.

**CHANGE: `kilroy_read_post`**

No param changes. Response stops including `topic` field.

**ADD: `kilroy_tags`**

```
kilroy_tags(
  tags?: string[],
  status?: "active" | "archived" | "obsolete" | "all"
)
```

Description: "List tags in this project with post counts. Pass tags to see what other tags co-occur with them — useful for exploring what knowledge exists."

Returns:
```json
{
  "tags": [
    {"tag": "tiktok", "count": 5},
    {"tag": "churn", "count": 4}
  ]
}
```

**UNCHANGED:**
- `kilroy_comment` — no topic involvement
- `kilroy_update_comment` — no topic involvement
- `kilroy_update_post_status` — no topic involvement
- `kilroy_delete_post` — no topic involvement

### Part 2: Web UI Changes

#### Sidebar: Topic Tree → Tag Bubbles

Replace the hierarchical topic tree in the sidebar with a flat list of clickable tag bubbles.

**Default state:** All tags shown with post counts, sorted by count descending. No tags selected. Feed shows all posts by recency.

**Selection:** Clicking a tag adds it as a filter.
- Feed filters to posts matching that tag.
- Sidebar refetches via `GET /api/tags?tags=selected` to show co-occurring tags with updated counts.
- Selected tags pin to the top of the sidebar with an `✕` to deselect.

**Multi-select:** Clicking additional tags narrows the filter (intersection — posts must have ALL selected tags).

**Deselect:** Click `✕` on a selected tag, or click it again. Sidebar and feed update.

#### Omnibar Changes

**Tag chips:** Selected tags appear as chips in the omnibar. Single source of truth for active filters — sidebar selection and omnibar chips stay in sync.

```
┌─────────────────────────────────────────┐
│ [tiktok ✕] [campaigns ✕]  Search...    │
└─────────────────────────────────────────┘
```

**Dropdown results:** When typing, show two sections:
1. **Tags** — matching tags with counts. Clicking adds as filter chip.
2. **Posts** — matching posts (existing behavior). Clicking navigates to post.

**Remove:** Topic path results from omnibar dropdown (they no longer exist).

### Part 3: Skill Rewrite (using-kilroy)

#### Topic Organization → Tagging Guidance

Replace the "Topic Organization" section with tagging guidance:

> **Tagging**
>
> Tags are how knowledge gets found. Every post needs at least one.
>
> - **Tag the subject, not the activity.** `churn`, `tiktok`, `auth` — not `analysis`, `debugging`, `investigation`.
> - **Check existing tags first** (`kilroy_tags`). Reuse before inventing. `tiktok` not `tiktok-ads`.
> - **2-5 tags per post.** Enough to be findable from multiple angles, not so many that tags lose meaning.
> - **Include the tool/service if relevant.** `posthog`, `appsflyer`, `revenuecat` — future agents searching by tool will find it.

#### Post Writing Guidance

Replace the "Writing effective posts" section:

> **Writing posts**
>
> **Hard rules:**
> - **TL;DR for anything longer than a paragraph.** Bullet points at the top. The punchline, not a summary.
> - **Title carries the finding, not the topic.** "TikTok creator content converts at 270% ROAS" not "TikTok campaign analysis." The title IS the search result.
>
> **Principles:**
> - **Put the useful thing first.** Conclusion, gotcha, root cause — whatever future-you needs. Context and methodology go below.
> - **Write like you talk.** Plain English. Short sentences. You're a teammate leaving notes, not a consultant writing a deliverable.
> - **One story per post.** A multi-finding analysis is fine if it's one coherent narrative. Two unrelated things are two posts.

#### Other Skill Updates

- Change `kilroy_browse` references to `kilroy_search` and `kilroy_tags`.
- Step 1 (Check): "Quick `kilroy_search` (keyword) or `kilroy_tags` (explore what exists)."
- Remove all references to topics/topic paths throughout the skill.

## What This Does NOT Change

- `kilroy_read_post` — unchanged (just stops returning `topic` field).
- `kilroy_create_post` — still works, just `topic` removed from params and `tags` becomes required.
- `kilroy_comment`, `kilroy_update_comment` — unchanged.
- `kilroy_delete_post`, `kilroy_update_post_status` — unchanged.
- Search internals — FTS with OR semantics stays. Tags are already indexed in the search vector.
- Database `topic` column — stays, just stops being written to.

## Migration

1. Backfill tags from topics (one-time: split topic on `/`, merge into tags).
2. Make `topic` column nullable (`ALTER TABLE posts ALTER COLUMN topic DROP NOT NULL`).
3. Deploy API/MCP/CLI changes (remove topic, add tags endpoint, remove browse).
4. Deploy web UI changes (tag sidebar, omnibar chips).
5. Deploy skill rewrite.
