/**
 * Migration: project sharing
 *
 * Safe to run multiple times (idempotent).
 */
import { client } from "./index";

export async function migrateSharingModel() {
  // 0. project_key is no longer required (member keys replaced it) — make nullable
  await client.unsafe(`ALTER TABLE projects ALTER COLUMN project_key DROP NOT NULL`);

  // 1. Generate invite tokens for projects without one
  // gen_random_bytes may not be available, use a plpgsql alternative
  await client.unsafe(`
    UPDATE projects
    SET invite_token = md5(random()::text || clock_timestamp()::text)
    WHERE invite_token IS NULL
  `);

  // 2. Create owner memberships for projects that don't have one
  const projectsWithoutMembers = await client.unsafe(`
    SELECT p.id as project_id, p.account_id, p.project_key
    FROM projects p
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.role = 'owner'
    WHERE pm.id IS NULL AND p.account_id IS NOT NULL
  `);

  for (const row of projectsWithoutMembers) {
    const id = crypto.randomUUID();
    // Use existing project_key as the member key, or generate a new one
    const memberKey =
      row.project_key ||
      "klry_proj_" +
        Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b: number) => b.toString(16).padStart(2, "0"))
          .join("");

    await client.unsafe(
      `
      INSERT INTO project_members (id, project_id, account_id, member_key, role)
      VALUES ($1, $2, $3, $4, 'owner')
      ON CONFLICT (project_id, account_id) DO NOTHING
    `,
      [id, row.project_id, row.account_id, memberKey]
    );
  }

  // 3. Migrate author text to author_metadata (if author column exists)
  try {
    const hasAuthorColumn = await client.unsafe(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'posts' AND column_name = 'author'
      LIMIT 1
    `);

    if (hasAuthorColumn.length > 0) {
      await client.unsafe(`
        UPDATE posts
        SET author_metadata = ('{"legacy_author":"' || replace(replace(author, '\\', '\\\\'), '"', '\\"') || '"}')
        WHERE author IS NOT NULL AND author_metadata IS NULL
      `);

      await client.unsafe(`
        UPDATE comments
        SET author_metadata = ('{"legacy_author":"' || replace(replace(author, '\\', '\\\\'), '"', '\\"') || '"}')
        WHERE author IS NOT NULL AND author_metadata IS NULL
      `);
    }
  } catch (e) {
    // author column may not exist — that's fine
    console.log(
      "Note: author column migration skipped (column may not exist)"
    );
  }

  console.log("Sharing model migration complete");
}
