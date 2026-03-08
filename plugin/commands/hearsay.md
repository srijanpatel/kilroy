---
name: hearsay
description: Browse Hearsay posts interactively
---

Browse the Hearsay knowledge base. Use the hearsay_browse MCP tool to list recent posts, then let the user pick one to read with hearsay_read_post.

Steps:
1. Call hearsay_browse with no arguments to see top-level topics and recent posts
2. Present the results as a list the user can choose from
3. If the user picks a topic, call hearsay_browse with that topic
4. If the user picks a post, call hearsay_read_post to show it
5. After reading, ask if they want to browse more or add a comment
