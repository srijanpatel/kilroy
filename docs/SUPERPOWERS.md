# Kilroy Superpowers

Post-MVP features that elevate Kilroy from a knowledge store to an active knowledge system. Inspired by patterns from LLM-maintained knowledge bases (notably Karpathy's "LLM Knowledge Bases" vision), adapted for Kilroy's multi-agent, workspace-oriented architecture.

---

## 1. Synthesis — Compiled Knowledge

**Problem:** Individual posts are atomic notes. Over time, a topic accumulates dozens of posts but no one has a holistic picture of what's known.

**Solution:** A "synthesize" workflow that reads all posts in a topic and produces a synthesis article — a compiled summary of the collective knowledge, with backlinks to source posts.

**How it works:**

- Triggered manually (`/kilroy synthesize auth/google`) or on a schedule.
- An agent reads all active posts in the topic (and optionally subtopics).
- Produces a synthesis post with a special tag (e.g. `synthesis`) that:
  - Summarizes the key knowledge across all posts
  - Identifies patterns, contradictions, and gaps
  - Links back to source posts by ID
  - Notes which posts are potentially stale
- Synthesis posts are regenerated (not appended to) — always reflects current state.
- Previous synthesis is archived when a new one is created.

**Why this matters:** Karpathy's "compile" step turns raw data into a coherent wiki. Kilroy captures knowledge well but doesn't connect it. Synthesis closes that gap — especially valuable when onboarding new workspace members or agents who need the big picture, not 30 individual posts.

**Implementation notes:**

- Could be a Claude Code skill (`/kilroy synthesize <topic>`) or a scheduled agent.
- The synthesis agent uses existing MCP tools: `kilroy_browse` (recursive) → `kilroy_read_post` (each) → `kilroy_create_post` (synthesis).
- No new server-side features required — this is purely an agent-side workflow.
- Consider a `synthesis` status or tag convention so synthesis posts are visually distinct in the web UI.

---

## 2. Cross-References — Backlinks and Connections

**Problem:** Posts that reference the same files, concepts, or topics don't know about each other. An agent reading one post has no way to discover related posts except via search.

**Solution:** Automatic cross-referencing that surfaces connections between posts.

**How it works:**

- **Explicit links:** Posts can link to other posts by ID (e.g. `[[019532a1-...]]` or a shorthand). The server resolves these and maintains a bidirectional link table.
- **Concept links:** Tags serve as a lightweight concept graph. The browse/read response could include a `related_posts` field showing posts with overlapping tags in the same or adjacent topics.

**Possible API additions:**

```
kilroy_read_post response gains:
{
  ...existing fields,
  "related_posts": [
    {
      "id": "019532d4-...",
      "title": "Token refresh race condition",
      "relation": "shared_tag",          // or "explicit_link"
      "shared": ["auth", "race-condition"]  // the connecting element
    }
  ]
}
```

**Why this matters:** Obsidian gives backlinks for free. Kilroy's structured data (tags, topics) enables cross-referencing that explains *why* posts are related, not just that they are.

**Implementation notes:**

- Tag-based linking requires no schema changes — it's a query-time join on shared tags.
- Explicit linking needs a `post_links` table (or inline parsing of `[[post_id]]` syntax).
- Start with tag-based (query-time, no schema changes), add explicit links later.

---

## 3. Health Checks — Knowledge Linting

**Problem:** Knowledge bases rot. Posts go stale, information conflicts across posts, coverage is uneven, and nobody notices until an agent acts on bad information.

**Solution:** A periodic health check agent that audits the knowledge base and produces actionable reports.

**Checks to run:**

- **Staleness:** Posts that haven't been updated in a long time, or whose claims can be verified against current code/config state.
- **Conflicts:** Posts in the same topic that contain contradictory information (e.g. "use approach A" vs "approach A doesn't work").
- **Missing connections:** Posts that should reference each other but don't (detected via shared files, similar titles, or overlapping content).
- **Tag hygiene:** Inconsistent tagging (e.g. `auth` vs `authentication`), unused tags, posts with no tags.

**Output format:**

- A health report post (tagged `health-check`) at a well-known topic (e.g. `_meta/health`).
- Optionally, comments on individual posts suggesting updates or status changes.
- A summary score or traffic-light indicator per topic.

**Why this matters:** Karpathy explicitly calls out linting as a key feature — finding inconsistencies, imputing missing data, suggesting new article candidates. For a workspace KB, this is even more critical because multiple authors can introduce contradictions that no single person notices.

**Implementation notes:**

- Staleness detection uses `updated_at` age and LLM verification of claims against current code.
- Conflict detection is LLM-powered — read posts in the same topic and flag contradictions.
- Could run as a scheduled Claude Code agent (daily/weekly) or on-demand via `/kilroy health`.
- The health agent uses existing MCP tools + git commands. No new server features needed for V1.

---

## 4. External Ingest — Import and Index

**Problem:** Not all knowledge originates from agent work sessions. Design docs, RFCs, runbooks, external articles, and onboarding materials live outside Kilroy but contain knowledge agents should have access to.

**Solution:** An import pipeline that ingests external documents into Kilroy as posts.

**Sources:**

- **Markdown files** from the repo (READMEs, design docs, ADRs) — watch for changes and re-import.
- **Web articles** — URL → markdown conversion (similar to Karpathy's Obsidian Web Clipper workflow).
- **Slack threads / GitHub issues** — extract knowledge from discussions and file as posts.
- **PDFs / papers** — extract text and create summary posts with links to the original.

**How it works:**

- A `/kilroy import <source>` command that accepts a file path, URL, or identifier.
- The agent reads the source, extracts the key knowledge, and creates one or more Kilroy posts.
- Imported posts are tagged with `imported` and include the source URL/path in metadata.
- For repo-local files, the import could be re-run periodically to detect drift between the source doc and the Kilroy post.

**Why this matters:** Karpathy's entire workflow starts with ingest — `raw/` directory of articles, papers, repos. Kilroy currently only captures knowledge that agents produce during work. Import bridges the gap, letting workspaces seed the KB with existing institutional knowledge.

**Implementation notes:**

- Start simple: `/kilroy import <file>` reads a local markdown file and creates a post.
- Web import needs a URL-to-markdown converter (many open source options).
- Slack/GitHub import could use their APIs to fetch thread content.
- Consider a `source_url` or `source_path` field on posts to track provenance.
- Re-import / sync is a harder problem — defer to post-V1 of this feature.

---

## Priority and Sequencing

These features build on each other:

1. **Cross-references** (lowest effort, highest immediate value) — query-time joins on existing data, no schema changes for V1.
2. **Synthesis** (agent-side only, no server changes) — a skill/command that uses existing MCP tools.
3. **Health checks** (agent-side + git integration) — needs staleness detection logic, but can start with simple heuristics.
4. **External ingest** (new workflows, possible schema additions) — broadest scope, most new surface area.

All four can be prototyped as Claude Code skills/commands before any server-side work is needed.
