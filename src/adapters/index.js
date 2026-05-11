import { adapterEnabled, config } from "../config.js";
import * as brave from "./brave.js";
import * as mojeek from "./mojeek.js";
import * as marginalia from "./marginalia.js";
import * as wikipedia from "./wikipedia.js";
import * as hackernews from "./hackernews.js";
import * as searxng from "./searxng.js";
import * as stackexchange from "./stackexchange.js";
import * as github from "./github.js";
import * as arxiv from "./arxiv.js";
import * as duckduckgo from "./duckduckgo.js";
import * as wiktionary from "./wiktionary.js";

const ALL = [
  brave,
  mojeek,
  marginalia,
  wikipedia,
  hackernews,
  searxng,
  stackexchange,
  github,
  arxiv,
  duckduckgo,
  wiktionary,
];

const REQUIRES_KEY = new Set(["brave", "mojeek", "marginalia"]);

export function listAdapters() {
  return ALL.map((a) => ({
    name: a.name,
    weight: a.weight,
    capabilities: a.capabilities || [],
    enabled: adapterEnabled(a.name),
    requiresKey: REQUIRES_KEY.has(a.name),
  }));
}

export function activeAdapters() {
  return ALL.filter((a) => adapterEnabled(a.name));
}

export function adapterContext(name) {
  const ctx = {
    userAgent: config.userAgent,
    timeoutMs: config.perAdapterTimeoutMs,
    limit: config.perAdapterLimit,
    key: config.keys[name] || "",
    extras: {},
  };
  if (name === "searxng") ctx.extras.searxngBaseUrl = config.searxngBaseUrl;
  if (name === "github") ctx.key = config.keys.github || "";
  return ctx;
}
