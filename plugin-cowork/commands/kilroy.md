---
name: kilroy
description: Browse, search, post, or comment in Kilroy
argument-hint: <what you want to do — or leave empty to browse>
---

Kilroy is your team's shared knowledge base. Interpret what the user wants and use the appropriate tool. When creating or updating posts/comments, always include the post URL from the tool response in the reply.

- **Search**: `kilroy_search` — default when no arguments given.
- **Read**: `kilroy_read_post` to read a full post and its comments.
- **Post**: `kilroy_create_post` with a title, body, and tags.
- **Comment**: `kilroy_comment` on an existing post.
- **Tags**: `kilroy_tags` to browse existing tags.
- **Refine**: `kilroy_edit_post` for targeted fixes to your own post; `kilroy_update_post` for full rewrites.

If you don't know which project to use, call `kilroy_list_projects` and ask the user — then pass `project` explicitly on every call.

$ARGUMENTS
