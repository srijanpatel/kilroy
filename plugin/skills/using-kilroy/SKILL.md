---
name: using-kilroy
description: >
  Injected at session start. Defines the Kilroy workflow loop — check for
  existing knowledge before starting, capture new knowledge before finishing.
---

<subagent-stop>
If you were dispatched as a subagent to execute a specific task, skip this.
</subagent-stop>

Kilroy is shared tribal knowledge — notes left by past agent sessions, teammates, and humans. It persists across sessions, machines, and the team. It is NOT your local auto-memory.

## The Loop

Every turn, follow this:

```
User message received
       │
       ▼
Could past context help?  ───no──→  Do the work
       │                                │
      yes                               │
       │                                │
  Quick kilroy_search             ┌─────┘
  or kilroy_browse                │
       │                          ▼
       └──────────────→     Do the work
                                  │
                                  ▼
                        Did I produce or learn
                        something worth keeping?
                              │          │
                             yes         no
                              │          │
                              ▼          ▼
                     kilroy_create_post  Done
                     or kilroy_comment
                              │
                              ▼
                            Done
```

## Step 1: Check (before starting work)

Ask yourself: **could a past session have left something useful here?**

Quick check with `kilroy_search` (keyword) or `kilroy_browse` (topic area). Takes seconds. If nothing relevant, move on.

Check when:
- Working on an unfamiliar area or module
- Debugging — someone may have hit this before
- Making a decision — prior reasoning may exist
- Using external services or infrastructure — known quirks
- The user references something from a past session

Skip when:
- Simple, self-contained tasks (rename a variable, fix a typo)
- You already checked Kilroy this session for the same topic
- The user explicitly needs a fast response

## Step 2: Capture (before ending your turn)

Ask yourself: **would a future session benefit from knowing what I just did?**

If yes, call `kilroy_create_post` or `kilroy_comment` before finishing your response. Do NOT ask the user — just do it and mention it briefly afterward.

Capture when:
- You completed a data analysis — funnel metrics, campaign performance, error rates, cost breakdowns. Analyses are expensive to reproduce. Always capture.
- You discovered a gotcha, undocumented behavior, or surprising result
- A decision was made and the reasoning matters
- An approach was tried and abandoned
- The user shared context that future sessions need — constraints, vendor limitations, preferences
- You resolved a customer issue that reveals a pattern
- You learned something operational — deployment quirks, environment setup

Skip when:
- The work was trivial and self-evident from the code
- The information is already in Kilroy (check first, comment if updating)
- The knowledge is personal to this user's session preferences (use local memory instead)

## Kilroy vs Local Memory

This is critical. Do not confuse them.

| | Kilroy | Local auto-memory |
|---|---|---|
| **Scope** | Team-wide, cross-session | Personal, this machine |
| **Content** | Decisions, analyses, gotchas, discoveries | User preferences, workflow habits |
| **Audience** | Future agents, teammates, humans | You, in future sessions |
| **Example** | "AppsFlyer requires enterprise license for cost data" | "User prefers tables over bullet lists" |
| **Example** | "Age verification launch caused 69% purchase drop" | "Always use bun, not npm" |

When the user says "remember this" or shares a reusable fact — **Kilroy, not local memory** — unless it's purely about how they want you to behave.

## Red Flags

If you catch yourself thinking any of these, stop and reconsider:

| Thought | Reality |
|---------|---------|
| "This analysis isn't important enough to save" | If you made tables or drew conclusions, it's worth saving. |
| "The user didn't ask me to save this" | You don't ask before writing to local memory either. Just do it. |
| "I'll capture it at the end of the session" | There is no end-of-session hook. Capture now or it's lost. |
| "This is just a quick lookup, no need to check Kilroy" | Quick lookups are exactly when Kilroy saves the most time. |
| "I already know about this topic" | Past agents may know things you don't. Check anyway. |
| "The user seems in a hurry" | A Kilroy search takes seconds. A Kilroy post takes seconds. Do both. |

## Topic Organization

When posting, pick a topic path. Topics are hierarchical like a filesystem.

- **Browse existing topics first** — consistency beats perfection
- **Mirror the codebase** for code knowledge (`auth/`, `api/`, `database/`)
- **Use domain areas** for non-code knowledge (`ops/`, `analytics/`, `customers/`, `product/`, `marketing/`)
- **Keep it shallow** — 2-3 levels max
- **When in doubt, go broad** — `analytics/` beats agonizing over `analytics/campaigns/tiktok`

## Assessing Posts You Find

- **`created_at`** — how old? Recent = more likely current
- **`commit_sha`** — compare to current codebase to gauge staleness
- **`author`** — human posts often carry deliberate decisions
- **`comment_count`** — more discussion = more nuance
- **`status`** — `active` (current), `archived` (stale), `obsolete` (wrong)

If a post is outdated, mark it `obsolete` or add a comment with what changed.
