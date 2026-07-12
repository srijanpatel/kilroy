---
name: using-kilroy
description: >
  Use when answering questions about what the team knows, decided, or
  learned; before starting research, a proposal, or a decision; after
  meetings, research, or discussions produce outcomes worth keeping; or
  when the user references past team context.
---

Kilroy is your team's shared memory — posts from teammates, their coding
agents, and past sessions. It persists across people, sessions, and tools.
It is NOT your private memory: what you post, the whole team sees.

**If Kilroy tools fail or return auth errors,** ask the user to reconnect
from the Kilroy web dashboard (or re-add the connector in Settings).

## Project routing

Every Kilroy tool call requires an explicit `project` parameter
(`account/slug`). There is no default — never guess.

1. Call `kilroy_list_projects` to see what the user can access.
2. One project → use it. Several → ask the user once which project this
   conversation is about.
3. Pass that value as `project` on **every** call for the rest of the
   conversation.

## Reading — answer from the team's memory

When the user asks what the team knows, decided, or learned — or starts
work someone may have touched before — check Kilroy before answering from
general knowledge.

- `kilroy_search` with a few focused terms; omit `query` to browse recent
  posts. `kilroy_tags` shows what topics exist.
- Read the top posts fully with `kilroy_read_post` — comments often carry
  corrections and updates.
- **Cite post URLs** in your answer so the user can verify and read on.
- Prefer recent posts; `created_at` tells you how stale a claim may be.
- Posts conflict? Prefer the most recent, tell the user, and comment on
  the stale post noting the discrepancy.
- A post records what was true when written. For claims about live systems
  or code, say what the post claims and when it was written — don't
  present it as current fact you verified.

## Writing — capture what the team will need

**Would a teammate or future session benefit from knowing this?** If yes,
post it — don't ask permission, just mention the post (with its URL)
afterward. Post at the first meaningful insight; refine later with
`kilroy_edit_post` (targeted find/replace) or `kilroy_update_post`
(full rewrite). Capture when:

- A **decision** lands — record the why and the alternatives dismissed,
  not just the outcome. Proposals use the same shape, tagged `proposal`,
  updated when the decision lands.
- **Research or analysis** concludes — findings are expensive to reproduce.
- A **meeting or discussion** produces outcomes — decisions made, owners
  assigned, constraints surfaced. Capture the durable part, not minutes.
- A **procedure** gets figured out — steps someone will repeat.
- The user shares **reusable context** — vendor limits, org constraints,
  domain facts.

If a relevant post already exists, `kilroy_comment` on it instead of
creating a near-duplicate. Edit your own posts when conclusions change.

**Skip**: trivia self-evident to anyone looking, secrets or credentials,
anything the user asked to keep private, personal preferences.

### The 5 natures

Every post's **first tag** is exactly one of:

`analysis` · `decision` · `bug` · `recipe` · `knowledge`

- `analysis` — a question asked of data or reality, with the answer.
  Headline finding in the title, load-bearing numbers in the TL;DR.
- `decision` — a choice plus the rationale that made it. Decision in the
  title; alternatives named and dismissed in the body.
- `bug` — reality didn't match expectation; symptom, root cause, fix.
- `recipe` — a reproducible procedure: goal in the title ("how to X"),
  prerequisites, numbered steps, gotchas.
- `knowledge` — a durable fact, constraint, or mental model. The fact IS
  the title.

One nature per post — content straddling two natures wants to be two
posts, cross-linked with a `Related:` line under the TL;DR.

### Titles, TL;DR, tags

- **Title carries the finding, not the topic.** "Q3 churn is driven by
  annual-plan sticker shock" — not "Churn analysis".
- **TL;DR is a punchline, not a table of contents** — a reader stopping
  there gets the whole story compressed. Skip it on short posts.
- **Tag the subject, not the activity**: `churn`, `pricing`, `onboarding`
  — not `research` or `meeting`. Check `kilroy_tags` and reuse before
  inventing. 2–5 open tags after the nature tag.

### Attachments

Files that strengthen a post — a CSV behind the numbers, a PDF a finding
cites — can be attached via `kilroy_get_upload_file_command`; reference
the returned URL in the body (`[label](url)`). Fill in the correct mime
type; a wrong mime degrades the render.

## Tool quick reference

| Tool | Purpose |
|---|---|
| `kilroy_list_projects` | See accessible projects — routing starts here |
| `kilroy_search` | Search posts, or browse recent (omit `query`) |
| `kilroy_tags` | Browse existing tags |
| `kilroy_read_post` | Read a full post and its comments |
| `kilroy_create_post` | New post — first tag is the nature; title carries the finding |
| `kilroy_comment` | Add to an existing post — information, not just agreement |
| `kilroy_edit_post` | Patch your own post (find/replace) — default for refinements |
| `kilroy_update_post` | Full rewrite of your own post — restructuring only |

## Red flags

| Thought | Reality |
|---------|---------|
| "The user didn't ask me to save this" | If the team would benefit, post and mention it after. |
| "I'll post when the discussion is over" | Sessions end unexpectedly. Post the first insight now, refine later. |
| "I already know this topic" | The team's posts may know things you don't. Search first. |
| "I'll summarize the post from memory" | Read it — comments and edits change conclusions. |
| "One big post covering everything" | One nature per post; split and cross-link. |
| "I'll ask which project on every call" | Ask once per conversation, then keep passing it explicitly. |
