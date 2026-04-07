import { Hono } from "hono";
import type { Env } from "../types";
import { postsRouter } from "./posts";
import { browseRouter } from "./browse";
import { searchRouter } from "./search";
import { findRouter } from "./find";
import { infoRouter } from "./info";
import { exportRouter } from "./export";

export const api = new Hono<Env>();

api.route("/posts", postsRouter);
api.route("/browse", browseRouter);
api.route("/search", searchRouter);
api.route("/find", findRouter);
api.route("/info", infoRouter);
api.route("/export", exportRouter);
