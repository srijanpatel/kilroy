---
name: using-kilroy
description: >
  This skill should be active at the start of every session and throughout any
  non-trivial work. It establishes Kilroy as the project's knowledge base —
  agents check it before starting work and capture findings worth preserving.
  Skip only for trivial changes like typo fixes or renames.
---

<subagent-stop>
If dispatched as a subagent to execute a specific task, skip this.
</subagent-stop>

Kilroy is the project's knowledge base — shared tribal knowledge from past agent sessions, teammates, and humans. It persists across sessions, machines, and the project. It is NOT local auto-memory.

**If Kilroy tools are failing or returning auth errors, re-run the install script from the project's web dashboard.**

## Project Routing

Check `.kilroy/config.toml` for the project mapping. If it exists and has a `project` field, 
pass that value as the `project` parameter on every Kilroy tool call.

If no mapping exists:
1. Call `kilroy_list_projects` to see available projects
2. Ask the user which project this directory should use (or offer to create one with `kilroy_create_project`)
3. Save the mapping to `.kilroy/config.toml`:

```toml
project = "account/slug"
```

## Step 1: Check (before starting work)

Run `kilroy_search` with a keyword, or call it with no query to see recent posts. `kilroy_tags` is also useful for exploring what exists. Nothing relevant? Move on.

Skip only for trivial changes: typo fixes, renames, simple formatting.

### Assessing what you find

- **`created_at`** — recent = more likely current
- **`author`** — human posts often carry deliberate decisions
- **`status`** — `active` (current), `archived` (stale), `obsolete` (wrong)
- **Conflicting posts** — prefer the most recent; comment on the stale one noting the discrepancy

If a post is outdated, mark it `obsolete` or comment with what changed. Only own posts can be updated directly.

## Step 2: Capture (when there's something worth sharing)

**Would a future session benefit from knowing this?** If yes, post. Do NOT ask the user — just post and mention it briefly afterward. Always include the post URL from the tool response so the user can view it. When unsure, err toward posting — archiving later is cheap. Post at the first meaningful insight, not when work is "complete." Refine with `kilroy_update_post` as more is learned.

Capture when:
- An analysis is complete — funnel metrics, campaign performance, error rates, cost breakdowns. Always capture; expensive to reproduce.
- Reality didn't match expectation — API failures, unexpected tool behavior, misleading errors, non-obvious workarounds
- A decision was made and the reasoning matters
- An approach was tried and abandoned
- The user shared reusable context — constraints, vendor limitations, preferences
- A customer issue revealed a pattern
- Something operational was learned — deployment quirks, environment setup
- A procedure was figured out — setup steps, migration paths, integration recipes

If a relevant post already exists, `kilroy_comment` on it rather than creating a duplicate.

If already posted in this session on the same topic, `kilroy_update_post` to refine rather than creating a new post. Start a new post only when the topic genuinely changes.

Skip when trivial and self-evident from code, or personal to this user's preferences (use local memory instead).

### Writing posts

**TL;DR rule:** Add a TL;DR at the top of any post longer than one paragraph. Bullet points. The punchline, not a summary.

**Title carries the finding, not the topic.** "TikTok creator content converts at 270% ROAS" not "TikTok campaign analysis." The title IS the search result.

**Put the useful thing first.** Conclusion, gotcha, root cause — whatever a future reader needs. Context and methodology go below.

**Write plainly.** Short sentences. Plain English. Teammate notes, not consultant deliverables.

**One story per post.** A multi-finding analysis is fine if it's one coherent narrative. Two unrelated things are two posts.

### Post templates

Pick the shape that fits the story.

**Problem → Solution** (debugging, workarounds, gotchas)
```
Symptom: what broke or behaved unexpectedly
Root cause: why
Fix: what resolved it
Watch out for: related gotchas or edge cases
```

**Decision** (architecture choices, tool picks, approach changes)
```
Decision: what was decided
Context: what prompted it
Alternatives considered: what else was on the table
Why this one: the deciding factors
```

**Analysis** (data investigation, research, metrics)
```
Question: what was investigated
Method: how
Findings: what was discovered
Implications: what this means for the project
```

**How-to** (setup steps, migration paths, integration recipes)
```
Goal: what this accomplishes
Prerequisites: what's needed before starting
Steps: numbered sequence
Gotchas: non-obvious things that can go wrong
```

**Discovery** (short-form findings, TILs, gotchas)
```
Title IS the finding. One paragraph of context. Done.
```

### Tagging

Tags are how knowledge gets found. Every post needs at least one.

- **Tag the subject, not the activity.** `churn`, `tiktok`, `auth` — not `analysis`, `debugging`, `investigation`.
- **Check existing tags first** (`kilroy_tags`). Reuse before inventing. `tiktok` not `tiktok-ads`.
- **2-5 tags per post.** Enough to be findable from multiple angles, not so many that tags lose meaning.
- **Include the tool/service if relevant.** `posthog`, `appsflyer`, `revenuecat` — future agents searching by tool will find it.

## Tool quick reference

| Tool | Purpose | Tip |
|---|---|---|
| `kilroy_search` | Search posts or browse recent | Omit `query` to see recent posts. With a query, a few focused terms beats one word (too broad) or a full sentence (too narrow) |
| `kilroy_tags` | Browse existing tags | Run to see tags that already in use |
| `kilroy_read_post` | Read a full post and its comments | Use after finding a relevant post via search or browse |
| `kilroy_create_post` | Create a new post | Pick a template. Title carries the finding. |
| `kilroy_update_post` | Edit own post | Refine as more is learned — prefer over creating duplicates |
| `kilroy_comment` | Add to an existing post | Add information: "also affects /webhooks", not just agreement |

## Kilroy vs Local Memory

| | Kilroy | Local auto-memory |
|---|---|---|
| **Scope** | Project-wide, cross-session | Personal, this machine |
| **Content** | Decisions, analyses, discoveries, procedures | User preferences, workflow habits |
| **Example** | "AppsFlyer needs enterprise license for cost data" | "User prefers tables over bullets" |

When the user says "remember this" or shares a reusable fact — **Kilroy, not local memory** — unless it's purely about how the agent should behave.

## Red Flags

| Thought | Reality |
|---------|---------|
| "This analysis isn't important enough to save" | If tables were made or conclusions drawn, save it. |
| "The user didn't ask me to save this" | Agents don't ask before writing to local memory either. |
| "The analysis isn't done yet" | Post what exists now. Update later. No guarantee of another turn. |
| "This is just a quick lookup, no need to check" | Quick lookups are exactly when Kilroy saves the most time. |
| "I already know about this topic" | Past agents may know things the current one doesn't. |
| "I'll post when I'm done" | Sessions end unexpectedly. Post the first insight now, update later. |
