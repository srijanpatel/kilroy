import { client, initDatabase } from "../src/db/index";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const DUMP_DIR = "/home/ubuntu/dump";

async function main() {
  await initDatabase();
  await mkdir(DUMP_DIR, { recursive: true });

  const workspaces = await client<
    { id: string; slug: string; project_key: string; created_at: Date }[]
  >`SELECT id, slug, project_key, created_at FROM workspaces ORDER BY created_at ASC`;

  console.log(`Found ${workspaces.length} workspace(s).`);

  for (const workspace of workspaces) {
    const posts = await client<
      {
        id: string;
        title: string;
        topic: string;
        body: string;
        author: string | null;
        status: string;
        tags: string | null;
        created_at: Date;
        updated_at: Date;
      }[]
    >`
      SELECT id, title, topic, body, author, status, tags, created_at, updated_at
      FROM posts
      WHERE workspace_id = ${workspace.id}
      ORDER BY created_at ASC
    `;

    const postIds = posts.map((p) => p.id);

    let allComments: {
      id: string;
      post_id: string;
      body: string;
      author: string | null;
      created_at: Date;
      updated_at: Date;
    }[] = [];

    if (postIds.length > 0) {
      allComments = await client<typeof allComments>`
        SELECT id, post_id, body, author, created_at, updated_at
        FROM comments
        WHERE post_id = ANY(${postIds})
        ORDER BY created_at ASC
      `;
    }

    // Group comments by post_id
    const commentsByPost = new Map<string, typeof allComments>();
    for (const comment of allComments) {
      const list = commentsByPost.get(comment.post_id) ?? [];
      list.push(comment);
      commentsByPost.set(comment.post_id, list);
    }

    const postsWithComments = posts.map((post) => ({
      id: post.id,
      title: post.title,
      topic: post.topic,
      body: post.body,
      author: post.author,
      status: post.status,
      tags: post.tags ? (JSON.parse(post.tags) as string[]) : [],
      created_at: post.created_at instanceof Date ? post.created_at.toISOString() : post.created_at,
      updated_at: post.updated_at instanceof Date ? post.updated_at.toISOString() : post.updated_at,
      comments: (commentsByPost.get(post.id) ?? []).map((c) => ({
        id: c.id,
        body: c.body,
        author: c.author,
        created_at: c.created_at instanceof Date ? c.created_at.toISOString() : c.created_at,
        updated_at: c.updated_at instanceof Date ? c.updated_at.toISOString() : c.updated_at,
      })),
    }));

    const dump = {
      workspace: {
        id: workspace.id,
        slug: workspace.slug,
        created_at:
          workspace.created_at instanceof Date
            ? workspace.created_at.toISOString()
            : workspace.created_at,
      },
      posts: postsWithComments,
    };

    const filePath = join(DUMP_DIR, `${workspace.slug}.json`);
    await writeFile(filePath, JSON.stringify(dump, null, 2), "utf-8");
    console.log(`  Wrote ${filePath} (${posts.length} posts, ${allComments.length} comments)`);
  }

  console.log("Done.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
