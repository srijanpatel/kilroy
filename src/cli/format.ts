export interface OutputOpts {
  json?: boolean;
  quiet?: boolean;
  formatter: (data: any) => { default: string; quiet: string };
}

export function output(data: any, opts: OutputOpts) {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const formatted = opts.formatter(data);
  console.log(opts.quiet ? formatted.quiet : formatted.default);
}

// ─── List formatters (TSV + quiet) ──────────────────────────────

export function formatBrowse(data: any): { default: string; quiet: string } {
  const lines: string[] = [];
  const ids: string[] = [];

  // Subtopics
  if (data.subtopics?.length) {
    for (const st of data.subtopics) {
      const count = st.post_count === 1 ? "1 post" : `${st.post_count} posts`;
      lines.push(`${st.name}/\t${count}`);
    }
    if (data.posts?.length) lines.push("");
  }

  // Posts as TSV: id \t topic \t status \t date \t title
  for (const p of data.posts || []) {
    const date = p.updated_at?.slice(0, 10) || "";
    lines.push(`${p.id}\t${p.topic}\t${p.status}\t${date}\t${p.title}`);
    ids.push(p.id);
  }

  if (!data.subtopics?.length && !data.posts?.length) {
    lines.push("(empty)");
  }

  if (data.has_more) {
    lines.push(`\n--cursor ${data.next_cursor} for more`);
  }

  return { default: lines.join("\n"), quiet: ids.join("\n") };
}

export function formatSearch(data: any): { default: string; quiet: string } {
  const lines: string[] = [];
  const ids: string[] = [];

  for (const r of data.results || []) {
    const date = r.updated_at?.slice(0, 10) || "";
    lines.push(`${r.post_id}\t${r.topic}\t${r.status}\t${date}\t${r.title}`);
    ids.push(r.post_id);
  }

  if (!data.results?.length) {
    lines.push("No results found.");
  }

  if (data.has_more) {
    lines.push(`\n--cursor ${data.next_cursor} for more`);
  }

  return { default: lines.join("\n"), quiet: ids.join("\n") };
}

export function formatFind(data: any): { default: string; quiet: string } {
  const lines: string[] = [];
  const ids: string[] = [];

  for (const r of data.results || []) {
    const date = r.updated_at?.slice(0, 10) || "";
    lines.push(`${r.id}\t${r.topic}\t${r.status}\t${date}\t${r.title}`);
    ids.push(r.id);
  }

  if (!data.results?.length) {
    lines.push("No results found.");
  }

  if (data.has_more) {
    lines.push(`\n--cursor ${data.next_cursor} for more`);
  }

  return { default: lines.join("\n"), quiet: ids.join("\n") };
}

// ─── Info formatter (markdown) ──────────────────────────────────

export function formatPost(data: any): { default: string; quiet: string } {
  const lines: string[] = [];

  lines.push(`# ${data.title}`);

  const meta: string[] = [];
  if (data.topic) meta.push(`topic: ${data.topic}`);
  meta.push(`status: ${data.status}`);
  if (data.author) meta.push(`by: ${data.author}`);
  lines.push(meta.join(" | "));

  if (data.tags?.length) lines.push(`tags: ${data.tags.join(", ")}`);
  if (data.files?.length) lines.push(`files: ${data.files.join(", ")}`);
  if (data.commit_sha) lines.push(`commit_sha: ${data.commit_sha}`);

  const created = data.created_at?.slice(0, 10) || "";
  const updated = data.updated_at?.slice(0, 10) || "";
  lines.push(`created: ${created}  updated: ${updated}`);
  lines.push("");
  lines.push(data.body || "");

  if (data.comments?.length) {
    for (const c of data.comments) {
      lines.push("");
      lines.push("---");
      const cDate = c.created_at?.slice(0, 10) || "";
      lines.push(`**${c.author || "anonymous"}** \u00b7 ${cDate}`);
      lines.push(c.body || "");
    }
  }

  const text = lines.join("\n");
  return { default: text, quiet: text };
}

// ─── Write formatters (ID output) ──────────────────────────────

export function formatCreated(data: any): { default: string; quiet: string } {
  return { default: data.id, quiet: data.id };
}

export function formatStatus(data: any): { default: string; quiet: string } {
  return { default: data.id, quiet: data.id };
}

export function formatDeleted(data: any): { default: string; quiet: string } {
  return { default: data.post_id, quiet: data.post_id };
}
