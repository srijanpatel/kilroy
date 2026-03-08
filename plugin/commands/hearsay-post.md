---
name: hearsay-post
description: Create a new Hearsay post to capture tribal knowledge
---

Guide the user through creating a new Hearsay post to capture tribal knowledge.

Steps:
1. Ask the user: "What topic should this go under?" Suggest a topic based on the current project directory if possible (e.g. `projects/hearsay`). Topics are hierarchical paths like `deployments/staging` or `debugging/postgres`.
2. Ask the user: "What's the title?" It should be a concise summary of the knowledge.
3. Ask the user: "What's the content?" This is the body of the post. Encourage them to include:
   - What was discovered or decided
   - Why it matters
   - Any relevant file paths, commands, or code snippets
   - Gotchas or things that were surprising
4. Ask if they want to add any tags (optional, comma-separated).
5. Summarize what will be posted and confirm.
6. Call hearsay_create_post with the collected information. The plugin hooks will automatically inject author and commit_sha.
