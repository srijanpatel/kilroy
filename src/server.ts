import { Hono } from "hono";
import { initDatabase } from "./db";
import { api } from "./routes/api";

initDatabase();

const app = new Hono();

app.route("/api", api);

const port = parseInt(process.env.HEARSAY_PORT || "7432");

console.log(`Hearsay server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
