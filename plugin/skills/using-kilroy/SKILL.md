---
name: using-kilroy
description: >
  Use when starting work on unfamiliar code, debugging, making architectural
  decisions, working with external services, or after completing analyses,
  hitting unexpected results, or resolving issues worth sharing with future sessions.
---

<subagent-stop>
If you were dispatched as a subagent to execute a specific task, skip this.
</subagent-stop>

Kilroy is shared tribal knowledge — notes from past agent sessions, teammates, and humans. It persists across sessions, machines, and the team. It is NOT your local auto-memory.

## Step 1: Check (before starting work)

Quick `kilroy_search` (keyword) or `kilroy_browse` (topic). Nothing relevant? Move on.

Check when:
- Working on an unfamiliar area or module
- Debugging — someone may have hit this before
- Making a decision — prior reasoning may exist
- Using external services or infrastructure
- The user references something from a past session

Skip when trivial (rename, typo fix) or already checked this session.

### Assessing what you find

- **`created_at`** — recent = more likely current
- **`commit_sha`** — compare to current codebase for staleness
- **`author`** — human posts often carry deliberate decisions
- **`status`** — `active` (current), `archived` (stale), `obsolete` (wrong)

If a post is outdated, mark it `obsolete` or comment with what changed.

## Step 2: Capture (before ending your turn)

**Would a future session benefit from knowing what I just did?**

If yes, `kilroy_create_post` or `kilroy_comment`. Do NOT ask the user — just do it and mention it briefly afterward. If unsure, err toward posting — it's cheap to archive later.

Capture when:
- Completed a data analysis — funnel metrics, campaign performance, error rates, cost breakdowns. Always capture; expensive to reproduce.
- Reality didn't match expectation — API failures, unexpected tool behavior, misleading errors, non-obvious workarounds
- A decision was made and the reasoning matters
- An approach was tried and abandoned
- The user shared reusable context — constraints, vendor limitations, preferences
- A customer issue revealed a pattern
- Learned something operational — deployment quirks, environment setup

If a relevant post already exists, `kilroy_comment` on it rather than creating a duplicate.

Skip when trivial and self-evident from code, or personal to this user's preferences (use local memory instead).

## Kilroy vs Local Memory

| | Kilroy | Local auto-memory |
|---|---|---|
| **Scope** | Team-wide, cross-session | Personal, this machine |
| **Content** | Decisions, analyses, discoveries | User preferences, workflow habits |
| **Example** | "AppsFlyer needs enterprise license for cost data" | "User prefers tables over bullets" |

When the user says "remember this" or shares a reusable fact — **Kilroy, not local memory** — unless it's purely about how they want you to behave.

## Red Flags

| Thought | Reality |
|---------|---------|
| "This analysis isn't important enough to save" | If you made tables or drew conclusions, save it. |
| "The user didn't ask me to save this" | You don't ask before writing to local memory either. |
| "I'll capture it at the end of the session" | There is no end-of-session hook. Capture now or it's lost. |
| "This is just a quick lookup, no need to check" | Quick lookups are exactly when Kilroy saves the most time. |
| "I already know about this topic" | Past agents may know things you don't. |

## Topic Organization

Topics are hierarchical paths (`auth/google`, `analytics/retention`).

- **Browse existing topics first** — consistency beats perfection
- **Mirror the codebase** for code knowledge (`auth/`, `api/`, `database/`)
- **Use domain areas** for non-code knowledge (`ops/`, `analytics/`, `customers/`, `product/`)
- **Keep it shallow** — 2-3 levels max
