#!/usr/bin/env bun
import { Command } from "commander";
import { resolveConfig, CliConfig } from "./config";
import { KilroyClient } from "./client";
import {
  output,
  formatBrowse,
  formatPost,
  formatSearch,
  formatFind,
  formatCreated,
  formatStatus,
  formatDeleted,
} from "./format";

const program = new Command();

program
  .name("kilroy")
  .description("Tribal knowledge for coding agents")
  .version("0.1.0")
  .option("--server <url>", "Kilroy server URL");

function getConfig(): CliConfig {
  const opts = program.opts();
  return resolveConfig({ server: opts.server });
}

function client(): KilroyClient {
  const config = getConfig();
  return new KilroyClient(config.serverUrl, config.token || undefined);
}

// ─── workspace create ───────────────────────────────────────────

program
  .command("workspace-create <slug>")
  .description("Create a new workspace")
  .option("--json", "Output raw JSON", false)
  .action(async (slug: string, opts) => {
    const data = await client().createWorkspace(slug);
    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`Workspace "${data.slug}" created.`);
      console.log();
      console.log(`Join link: ${data.join_url}`);
      console.log(`\nSetup (run in project directory):`);
      console.log(`  curl -sL "${data.workspace_url}/_/install?token=${data.project_key}" | sh`);
    }
  });

// ─── ls ──────────────────────────────────────────────────────────

program
  .command("ls [topic]")
  .description("Browse a topic")
  .option("-r, --recursive", "List all posts recursively", false)
  .option("-s, --status <status>", "Filter: active, archived, obsolete, all", "active")
  .option("--sort <field>", "Sort: updated_at, created_at, title", "updated_at")
  .option("--order <dir>", "Sort direction: asc, desc", "desc")
  .option("-n, --limit <n>", "Max results (1-100)", "50")
  .option("--cursor <cursor>", "Pagination cursor")
  .option("-q, --quiet", "Post IDs only", false)
  .option("--json", "Output raw JSON", false)
  .action(async (topic: string | undefined, opts) => {
    const params: Record<string, string> = {};
    if (topic) params.topic = topic;
    if (opts.recursive) params.recursive = "true";
    if (opts.status !== "active") params.status = opts.status;
    if (opts.sort !== "updated_at") params.order_by = opts.sort;
    if (opts.order !== "desc") params.order = opts.order;
    if (opts.limit !== "50") params.limit = opts.limit;
    if (opts.cursor) params.cursor = opts.cursor;

    const data = await client().browse(params);
    output(data, { json: opts.json, quiet: opts.quiet, formatter: formatBrowse });
  });

// ─── read ─────────────────────────────────────────────────────────

program
  .command("read <post_id>")
  .description("Read a post and its comments")
  .option("--json", "Output raw JSON", false)
  .action(async (postId: string, opts) => {
    const data = await client().readPost(postId);
    output(data, { json: opts.json, formatter: formatPost });
  });

// ─── grep ────────────────────────────────────────────────────────

program
  .command("grep <query> [topic]")
  .description("Full-text search")
  .option("-E, --regex", "Treat query as regex", false)
  .option("-t, --topic <topic>", "Restrict to topic prefix")
  .option("--sort <field>", "Sort: relevance, updated_at, created_at", "relevance")
  .option("--order <dir>", "Sort direction: asc, desc", "desc")
  .option("-n, --limit <n>", "Max results (1-100)", "20")
  .option("--cursor <cursor>", "Pagination cursor")
  .option("-q, --quiet", "Post IDs only", false)
  .option("--json", "Output raw JSON", false)
  .action(async (query: string, topicArg: string | undefined, opts) => {
    const params: Record<string, string> = { query };
    const topic = opts.topic || topicArg;
    if (topic) params.topic = topic;
    if (opts.regex) params.regex = "true";
    if (opts.sort !== "relevance") params.order_by = opts.sort;
    if (opts.order !== "desc") params.order = opts.order;
    if (opts.limit !== "20") params.limit = opts.limit;
    if (opts.cursor) params.cursor = opts.cursor;

    const data = await client().search(params);
    output(data, { json: opts.json, quiet: opts.quiet, formatter: formatSearch });
  });

// ─── post ────────────────────────────────────────────────────────

program
  .command("post <topic>")
  .description("Create a new post")
  .requiredOption("--title <title>", "Post title")
  .option("-b, --body <body>", "Post body")
  .option("--tag <tag>", "Tag (repeatable)", collect, [])
  .option("--author <author>", "Override author")
  .option("--json", "Output raw JSON", false)
  .action(async (topic: string, opts) => {
    let body = opts.body;

    // Read from stdin if no --body and stdin is not a TTY
    if (!body && !process.stdin.isTTY) {
      body = await readStdin();
    }

    if (!body) {
      console.error("Error: No body provided. Use --body or pipe stdin.");
      process.exit(1);
    }

    const config = getConfig();
    const tags = opts.tag.length ? [...opts.tag] : [];
    if (config.sessionTag) tags.push(config.sessionTag);

    const payload: Record<string, any> = { title: opts.title, topic, body };
    if (tags.length) payload.tags = tags;
    payload.author = opts.author || config.author;

    const data = await client().createPost(payload);
    output(data, { json: opts.json, formatter: formatCreated });
  });

// ─── comment ─────────────────────────────────────────────────────

program
  .command("comment <post_id>")
  .description("Add a comment to a post")
  .option("-b, --body <body>", "Comment body")
  .option("--author <author>", "Override author")
  .option("--json", "Output raw JSON", false)
  .action(async (postId: string, opts) => {
    let body = opts.body;

    if (!body && !process.stdin.isTTY) {
      body = await readStdin();
    }

    if (!body) {
      console.error("Error: No body provided. Use --body or pipe stdin.");
      process.exit(1);
    }

    const config = getConfig();
    const payload: Record<string, any> = { body };
    payload.author = opts.author || config.author;

    const data = await client().createComment(postId, payload);
    output(data, { json: opts.json, formatter: formatCreated });
  });

// ─── status ──────────────────────────────────────────────────────

program
  .command("status <post_id> <status>")
  .description("Change a post's status")
  .option("--json", "Output raw JSON", false)
  .action(async (postId: string, status: string, opts) => {
    const data = await client().updateStatus(postId, status);
    output(data, { json: opts.json, formatter: formatStatus });
  });

// ─── archive / obsolete / restore ────────────────────────────────

for (const [cmd, targetStatus] of [
  ["archive", "archived"],
  ["obsolete", "obsolete"],
  ["restore", "active"],
] as const) {
  program
    .command(`${cmd} <post_id>`)
    .description(`Set post status to ${targetStatus}`)
    .option("--json", "Output raw JSON", false)
    .action(async (postId: string, opts) => {
      const data = await client().updateStatus(postId, targetStatus);
      output(data, { json: opts.json, formatter: formatStatus });
    });
}

// ─── rm ──────────────────────────────────────────────────────────

program
  .command("rm <post_id>")
  .description("Permanently delete a post")
  .option("--json", "Output raw JSON", false)
  .action(async (postId: string, opts) => {
    const data = await client().deletePost(postId);
    output(data, { json: opts.json, formatter: formatDeleted });
  });

// ─── find ───────────────────────────────────────────────────────

program
  .command("find [topic]")
  .description("Search posts by metadata")
  .option("-a, --author <author>", "Filter by author")
  .option("--tag <tag>", "Filter by tag (repeatable)", collect, [])
  .option("--since <date>", "Posts updated after date (ISO 8601)")
  .option("--before <date>", "Posts updated before date")
  .option("-s, --status <status>", "Filter: active, archived, obsolete, all", "active")
  .option("--sort <field>", "Sort: updated_at, created_at, title", "updated_at")
  .option("--order <dir>", "Sort direction: asc, desc", "desc")
  .option("-n, --limit <n>", "Max results (1-100)", "20")
  .option("--cursor <cursor>", "Pagination cursor")
  .option("-q, --quiet", "Post IDs only", false)
  .option("--json", "Full JSON response", false)
  .action(async (topicArg: string | undefined, opts) => {
    const hasFilter = !!(
      topicArg ||
      opts.author ||
      opts.tag.length ||
      opts.since ||
      opts.before
    );

    if (!hasFilter) {
      console.error("Error: At least one filter required (--author, --tag, --since, --before, or topic).");
      process.exit(1);
    }

    const params: Record<string, string | string[]> = {};
    const topic = topicArg;
    if (topic) params.topic = topic;
    if (opts.author) params.author = opts.author;
    if (opts.tag.length) params.tag = opts.tag;
    if (opts.since) params.since = opts.since;
    if (opts.before) params.before = opts.before;
    if (opts.status !== "active") params.status = opts.status;
    if (opts.sort !== "updated_at") params.order_by = opts.sort;
    if (opts.order !== "desc") params.order = opts.order;
    if (opts.limit !== "20") params.limit = opts.limit;
    if (opts.cursor) params.cursor = opts.cursor;

    const data = await client().find(params);
    output(data, { json: opts.json, quiet: opts.quiet, formatter: formatFind });
  });

// ─── edit ───────────────────────────────────────────────────────

program
  .command("edit <post_id> [comment_id]")
  .description("Update a post or comment")
  .option("--title <title>", "New title (posts only)")
  .option("-b, --body <body>", "New body")
  .option("--tag <tag>", "Replace tags (repeatable, posts only)", collect, [])
  .option("--topic <topic>", "Move to new topic (posts only)")
  .option("--author <author>", "Override author (must match original)")
  .option("--json", "Full JSON response", false)
  .action(async (postId: string, commentId: string | undefined, opts) => {
    let body = opts.body;

    const config = getConfig();
    const author = opts.author || config.author;

    if (commentId) {
      // Edit comment: read stdin if no --body provided
      if (!body && !process.stdin.isTTY) {
        body = await readStdin();
      }

      const payload: Record<string, any> = {};
      if (body) payload.body = body;
      if (author) payload.author = author;

      if (!payload.body) {
        console.error("Error: --body or stdin required when editing a comment.");
        process.exit(1);
      }

      const data = await client().updateComment(postId, commentId, payload);
      output(data, { json: opts.json, formatter: formatCreated });
    } else {
      // Edit post: body must be supplied via --body flag (not stdin)
      // so we can give an immediate error when no fields are provided
      const payload: Record<string, any> = {};
      if (opts.title) payload.title = opts.title;
      if (body) payload.body = body;
      if (opts.tag.length) payload.tags = opts.tag;
      if (opts.topic) payload.topic = opts.topic;
      if (author) payload.author = author;

      if (Object.keys(payload).length === 0 || (Object.keys(payload).length === 1 && payload.author)) {
        console.error("Error: At least one field required: --title, --body, --tag, --topic.");
        process.exit(1);
      }

      const data = await client().updatePost(postId, payload);
      output(data, { json: opts.json, formatter: formatCreated });
    }
  });

// ─── helpers ─────────────────────────────────────────────────────

function collect(val: string, acc: string[]): string[] {
  acc.push(val);
  return acc;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

program.parse();
