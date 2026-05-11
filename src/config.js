import { resolve } from "node:path";
import { readFileSync } from "node:fs";

loadDotenv(resolve(process.cwd(), ".env"));

export const config = {
  port: Number(process.env.PORT || 3040),
  host: process.env.HOST || "0.0.0.0",
  userAgent: process.env.WEBSEARCH_USER_AGENT || "websearch/0.1",
  lensPath: resolve(process.cwd(), process.env.WEBSEARCH_LENS || "lenses/default.json"),
  keys: {
    brave: process.env.BRAVE_API_KEY || "",
    mojeek: process.env.MOJEEK_API_KEY || "",
    marginalia: process.env.MARGINALIA_API_KEY || "",
    github: process.env.GITHUB_TOKEN || "",
  },
  searxngBaseUrl: process.env.WEBSEARCH_SEARXNG_BASE_URL || "",
  perAdapterTimeoutMs: Number(process.env.WEBSEARCH_TIMEOUT_MS || 6000),
  perAdapterLimit: Number(process.env.WEBSEARCH_PER_ADAPTER_LIMIT || 10),
  cache: {
    dir: resolve(process.cwd(), process.env.WEBSEARCH_CACHE_DIR || "data/cache"),
    ttlMs: Number(process.env.WEBSEARCH_CACHE_TTL_MS || 3_600_000),
    enabled: process.env.WEBSEARCH_CACHE !== "off",
  },
};

export function adapterEnabled(name) {
  if (name === "brave") return Boolean(process.env.BRAVE_API_KEY);
  if (name === "mojeek") return Boolean(process.env.MOJEEK_API_KEY);
  if (name === "marginalia") {
    const k = process.env.MARGINALIA_API_KEY || "";
    return Boolean(k) && k !== "test";
  }
  if (name === "searxng") return Boolean(process.env.WEBSEARCH_SEARXNG_BASE_URL);
  return true;
}

function loadDotenv(path) {
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return; }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
