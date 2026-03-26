import { Hono } from "hono";
import { postsRouter } from "./posts";
import { browseRouter } from "./browse";
import { searchRouter } from "./search";
import { findRouter } from "./find";

export const api = new Hono();

api.route("/posts", postsRouter);
api.route("/browse", browseRouter);
api.route("/search", searchRouter);
api.route("/find", findRouter);
