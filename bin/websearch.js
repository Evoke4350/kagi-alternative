#!/usr/bin/env node
import { fileURLToPath } from "node:url";

const DEFAULT_SERVER = "http://127.0.0.1:3040";
const DEFAULT_LIMIT = 10;
const DEFAULT_WIDTH = 80;

const USAGE = `Usage: websearch [options] <query...>

Query the local or remote websearch server and print results.

Options:
  --server <url>   Server base URL (default: ${DEFAULT_SERVER})
  --limit <n>      Max number of results (default: ${DEFAULT_LIMIT})
  --json           Output raw JSON instead of formatted text
  --no-color       Disable ANSI colors
  -h, --help       Show this help

Examples:
  websearch hyprland dotfiles
  websearch --json "arch linux"
  websearch --server http://192.168.0.109:3040 "kagi"
  echo "openbsd" | websearch
`;

export function parseArgs(argv) {
  const out = {
    query: "",
    server: DEFAULT_SERVER,
    limit: DEFAULT_LIMIT,
    json: false,
    color: defaultColor(),
    help: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--no-color") {
      out.color = false;
    } else if (arg === "--server") {
      const value = argv[++i];
      if (value === undefined) return { error: "--server requires a value" };
      out.server = value;
    } else if (arg === "--limit") {
      const value = argv[++i];
      if (value === undefined) return { error: "--limit requires a value" };
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return { error: `invalid --limit: ${value}` };
      out.limit = Math.floor(n);
    } else if (arg.startsWith("--")) {
      return { error: `unknown flag: ${arg}` };
    } else {
      positional.push(arg);
    }
  }

  out.query = positional.join(" ");
  return out;
}

function defaultColor() {
  if (process.env.NO_COLOR) return false;
  if (!process.stdout.isTTY) return false;
  return true;
}

const CODES = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function paint(text, code, color) {
  if (!color) return text;
  return `${code}${text}${CODES.reset}`;
}

export function wrap(text, width) {
  if (!text) return "";
  const w = Math.max(1, Math.floor(width || DEFAULT_WIDTH));
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line.length) {
      // word longer than width: hard-break
      if (word.length > w) {
        let rest = word;
        while (rest.length > w) {
          lines.push(rest.slice(0, w));
          rest = rest.slice(w);
        }
        line = rest;
      } else {
        line = word;
      }
    } else if (line.length + 1 + word.length <= w) {
      line += " " + word;
    } else {
      lines.push(line);
      if (word.length > w) {
        let rest = word;
        while (rest.length > w) {
          lines.push(rest.slice(0, w));
          rest = rest.slice(w);
        }
        line = rest;
      } else {
        line = word;
      }
    }
  }
  if (line.length) lines.push(line);
  return lines.join("\n");
}

export function formatResult(result, options = {}) {
  const color = !!options.color;
  const width = options.width || DEFAULT_WIDTH;
  const title = result.title || "(no title)";
  const url = result.url || "";
  const host = result.host || hostOf(url);
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const snippet = result.snippet || "";

  const titleLine = paint(title, CODES.bold, color);
  const urlLine = paint(url, CODES.dim + CODES.cyan, color);
  const tagsRaw = sources.length ? `${host} [${sources.join(", ")}]` : host;
  const tagsLine = paint(tagsRaw, CODES.gray, color);
  const snippetWrapped = wrap(snippet, width);

  const parts = [titleLine, urlLine, tagsLine];
  if (snippetWrapped) parts.push(snippetWrapped);
  return parts.join("\n");
}

export function formatSummary(payload, elapsedMs, options = {}) {
  const color = !!options.color;
  const n = (payload.results || []).length;
  const k = (payload.adapters || []).filter((a) => a.ok).length;
  const text = `${n} results from ${k} sources in ${elapsedMs}ms`;
  return paint(text, CODES.gray, color);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  let data = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) data += chunk;
  return data.split(/\r?\n/)[0].trim();
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) {
    process.stderr.write(`error: ${opts.error}\n\n${USAGE}`);
    return 1;
  }
  if (opts.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  let query = opts.query;
  if (!query) query = await readStdin();
  if (!query) {
    process.stderr.write(`error: no query provided\n\n${USAGE}`);
    return 1;
  }

  const width = process.stdout.columns || DEFAULT_WIDTH;
  const server = opts.server.replace(/\/+$/, "");
  const url = `${server}/api/search?q=${encodeURIComponent(query)}&limit=${opts.limit}`;

  const started = Date.now();
  let response;
  try {
    response = await globalThis.fetch(url);
  } catch (error) {
    process.stderr.write(`error: cannot reach ${server}: ${error.message}\n`);
    return 1;
  }
  if (!response.ok) {
    process.stderr.write(`error: ${server} returned HTTP ${response.status}\n`);
    return 1;
  }
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    process.stderr.write(`error: invalid JSON response: ${error.message}\n`);
    return 1;
  }
  const elapsed = Date.now() - started;

  if (opts.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return 0;
  }

  const results = payload.results || [];
  if (!results.length) {
    process.stdout.write(`no results for "${query}"\n`);
    return 0;
  }

  const chunks = results.map((r) => formatResult(r, { color: opts.color, width }));
  process.stdout.write(chunks.join("\n\n") + "\n\n");
  process.stdout.write(formatSummary(payload, elapsed, { color: opts.color }) + "\n");
  return 0;
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === `file://${process.argv[1]}` || fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`error: ${error.stack || error.message}\n`);
      process.exit(1);
    },
  );
}
