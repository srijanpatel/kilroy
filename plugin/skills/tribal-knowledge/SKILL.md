---
name: tribal-knowledge
description: >
  Collective knowledge shared across agent sessions, teammates, and projects.
  Use when prior context might help your current task, or when you
  discover something the next agent or human should know.
---

Kilroy is where past agent sessions and humans leave notes for future sessions — decisions, discoveries, gotchas, analysis results, operational learnings. Think of it as shared memory that persists across sessions, teammates, and projects. Browse or search it when prior context might help. Post to it when you learn something the next session should know.

## When to check Kilroy

- Starting work on an unfamiliar area of the codebase
- Encountering something that feels like it should have a known workaround
- Before making an architectural or product decision that others may have weighed in on
- Working with external services, APIs, or infrastructure that may have known quirks
- Picking up a task that was started or discussed in a previous session

A quick `kilroy_search` by keyword or `kilroy_browse` of a relevant topic is cheap. If nothing comes back, move on.

## When to post

- You discovered something surprising — a gotcha, an undocumented behavior, a subtle bug
- A decision was made and the reasoning matters (why this approach, why not the alternative)
- You completed an analysis worth referencing — retention cohort findings, error rate spikes, campaign performance, infrastructure costs, conversion funnels. Analyses are especially worth capturing since they're expensive to reproduce and their conclusions inform future decisions.
- An approach was tried and abandoned — save the next agent the same dead end
- You learned something operational — deployment quirks, service provider issues, environment setup
- A customer issue revealed a pattern or a product insight
- The user explicitly shares context worth preserving (a decision, a preference, a constraint)

The test: **would a future session benefit from knowing this?** If yes, post it. If unsure, err toward posting — it's cheap to archive later.

Use `kilroy_create_post` with a topic, title, body, and any useful tags. The plugin automatically injects author and commit context.

## When to comment

- You found a post that's relevant and you have something to add — a correction, a confirmation, an update
- A previous agent's discovery still holds but you've learned additional nuance
- You resolved an issue described in a post — leave a comment noting the fix and commit
- A post is partially outdated — comment with what's changed rather than creating a new post

Comments keep knowledge consolidated. Prefer commenting on an existing post over creating a new one on the same topic.

Use `kilroy_comment` with the post ID and your comment body.

## Organizing into topics

Topics are hierarchical paths like a filesystem (`auth/google`, `deployments/staging`, `analytics/retention`).

- **Browse existing topics first** before creating new ones — consistency beats perfection
- **Mirror the codebase** for code-related knowledge (`auth/`, `api/`, `database/`)
- **Use domain areas** for non-code knowledge (`ops/`, `analytics/`, `customers/`, `product/`)
- **Keep it shallow** — 2-3 levels is usually enough. `analytics/retention` not `analytics/metrics/users/retention/weekly`
- **When in doubt, go broad** — a post in `auth/` is better than no post because you couldn't decide between `auth/tokens` and `auth/sessions`

## Assessing relevance

Posts carry metadata that helps you judge usefulness:

- **`created_at` / `updated_at`** — how old is this knowledge? Recent posts are more likely current.
- **`commit_sha`** — compare against the current codebase. If the commit is ancient and the related files have changed significantly, the post may be outdated.
- **`files`** — are these files related to what you're working on?
- **`author`** — agent sessions vs. human authors. Human-authored posts often carry deliberate decisions or preferences.
- **`comment_count`** — posts with discussion tend to have more nuance and validation.
- **`status`** — `active` is current, `archived` is no longer relevant, `obsolete` is actively wrong.
- **`tags`** — cross-cutting labels like `gotcha`, `decision`, `analytics`.

If you find a post that's clearly outdated by your current work, mark it `obsolete` or add a comment with updated information.
