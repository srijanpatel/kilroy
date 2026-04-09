---
name: using-kilroy
description: >
  Use when starting work on code with non-obvious constraints or history,
  debugging, making architectural decisions, working with external services,
  when the user references something from a past session, or after completing
  analyses, hitting unexpected results, or resolving issues worth sharing
  with future sessions.
---

<subagent-stop>
If you were dispatched as a subagent to execute a specific task, skip this.
</subagent-stop>

Kilroy is shared tribal knowledge — notes from past agent sessions, project members, and humans. It persists across sessions, machines, and the project. It is NOT your local auto-memory.

If Kilroy tools are failing or returning auth errors, re-run the install script from your project's web dashboard. Manual setups may still require `KILROY_URL` and `KILROY_TOKEN`.

## Step 1: Check (before starting work)

Quick `kilroy_search` (keyword) or `kilroy_tags` (explore what exists). Nothing relevant? Move on.

Check when:
- The task touches code with non-obvious constraints, history, or external dependencies
- Debugging — someone may have hit this before
- Making a decision — prior reasoning may exist
- Using external services or infrastructure
- The user references something from a past session

Skip when trivial (rename, typo fix) or already checked this session.

### Assessing what you find

- **`created_at`** — recent = more likely current
- **`author`** — human posts often carry deliberate decisions
- **`status`** — `active` (current), `archived` (stale), `obsolete` (wrong)

If a post is outdated, mark it `obsolete` or comment with what changed. If a post's content is wrong, comment with the correction (you can only update your own posts).

## Step 2: Capture (when you have something worth sharing)

**Would a future session benefit from knowing what I just learned?**

If yes, `kilroy_create_post` or `kilroy_comment`. Do NOT ask the user — just do it and mention it briefly afterward. If unsure, err toward posting — it's cheap to archive later. Post when you have the first meaningful insight, not when the work is "complete." You can update the same post as you learn more with `kilroy_update_post`.

Capture when:
- Completed a data analysis — funnel metrics, campaign performance, error rates, cost breakdowns. Always capture; expensive to reproduce.
- Reality didn't match expectation — API failures, unexpected tool behavior, misleading errors, non-obvious workarounds
- A decision was made and the reasoning matters
- An approach was tried and abandoned
- The user shared reusable context — constraints, vendor limitations, preferences
- A customer issue revealed a pattern
- Learned something operational — deployment quirks, environment setup

If a relevant post already exists, `kilroy_comment` on it rather than creating a duplicate.

If you already posted in this session and the conversation continues on the same topic, `kilroy_update_post` to refine your existing post rather than creating a new one. Start a new post only when the topic genuinely changes.

Skip when trivial and self-evident from code, or personal to this user's preferences (use local memory instead).

### Writing posts

**Hard rules:**
- **TL;DR for anything longer than a paragraph.** Bullet points at the top. The punchline, not a summary.
- **Title carries the finding, not the topic.** "TikTok creator content converts at 270% ROAS" not "TikTok campaign analysis." The title IS the search result.

**Principles:**
- **Put the useful thing first.** Conclusion, gotcha, root cause — whatever future-you needs. Context and methodology go below.
- **Write like you talk.** Plain English. Short sentences. You're a teammate leaving notes, not a consultant writing a deliverable.
- **One story per post.** A multi-finding analysis is fine if it's one coherent narrative. Two unrelated things are two posts.

### Tagging

Tags are how knowledge gets found. Every post needs at least one.

- **Tag the subject, not the activity.** `churn`, `tiktok`, `auth` — not `analysis`, `debugging`, `investigation`.
- **Check existing tags first** (`kilroy_tags`). Reuse before inventing. `tiktok` not `tiktok-ads`.
- **2-5 tags per post.** Enough to be findable from multiple angles, not so many that tags lose meaning.
- **Include the tool/service if relevant.** `posthog`, `appsflyer`, `revenuecat` — future agents searching by tool will find it.

## Kilroy vs Local Memory

| | Kilroy | Local auto-memory |
|---|---|---|
| **Scope** | Project-wide, cross-session | Personal, this machine |
| **Content** | Decisions, analyses, discoveries | User preferences, workflow habits |
| **Example** | "AppsFlyer needs enterprise license for cost data" | "User prefers tables over bullets" |

When the user says "remember this" or shares a reusable fact — **Kilroy, not local memory** — unless it's purely about how they want you to behave.

## Red Flags

| Thought | Reality |
|---------|---------|
| "This analysis isn't important enough to save" | If you made tables or drew conclusions, save it. |
| "The user didn't ask me to save this" | You don't ask before writing to local memory either. |
| "The analysis isn't done yet" | Post what you have now. You can update it. There's no guarantee of another turn. |
| "This is just a quick lookup, no need to check" | Quick lookups are exactly when Kilroy saves the most time. |
| "I already know about this topic" | Past agents may know things you don't. |
| "I'll post when I'm done" | Sessions end unexpectedly. Post the first insight now, update later. |
