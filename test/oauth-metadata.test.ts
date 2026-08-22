import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { protectedResourceMetadata } from "../src/routes/oauth-metadata";

const app = new Hono();
app.route("/", protectedResourceMetadata);
// Mirrors server.ts: the project SPA catch-all would otherwise swallow
// two-segment paths like /.well-known/oauth-protected-resource/mcp.
app.get("/:account/:project/*", (c) => c.html("<html>spa</html>"));

const expected = {
  resource: "https://kilroy.example.com/mcp",
  authorization_servers: ["https://kilroy.example.com/api/auth"],
  bearer_methods_supported: ["header"],
};

describe("protected resource metadata", () => {
  it.each([
    // RFC 9728 path-insertion form — what rmcp (Codex) probes first
    "/.well-known/oauth-protected-resource/mcp",
    // Path-appended form
    "/mcp/.well-known/oauth-protected-resource",
    // Canonical root form
    "/.well-known/oauth-protected-resource",
  ])("serves JSON at %s", async (path) => {
    const res = await app.request(`https://kilroy.example.com${path}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual(expected);
  });
});
