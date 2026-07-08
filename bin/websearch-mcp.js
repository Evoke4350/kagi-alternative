#!/usr/bin/env node
// MCP (Model Context Protocol) stdio server exposing websearch to LLM hosts:
// LM Studio, Claude Desktop, or any MCP client gets a `web_search` tool backed
// by the full fan-out -> dedupe -> rank -> lens pipeline.
//
// Zero dependencies, like the rest of the project: MCP's stdio transport is
// newline-delimited JSON-RPC 2.0, implemented by hand below.
//
// Client config (e.g. LM Studio mcp.json):
//   { "mcpServers": { "websearch": {
//       "command": "node",
//       "args": ["/path/to/websearch/bin/websearch-mcp.js"] } } }
import { createInterface } from "node:readline";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { metaSearch } from "../src/search/aggregate.js";
import { loadLens, normalizeLens } from "../src/search/lens.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROTOCOL_VERSION = "2025-03-26";
const DEFAULT_LIMIT = 8;

const TOOLS = [
  {
    name: "web_search",
    description:
      "Search the web via a self-hosted metasearch engine (multiple backends, " +
      "deduplicated and re-ranked). Returns titles, URLs, and snippets. Use " +
      "for current events, facts to verify, documentation, or anything beyond " +
      "your training data.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        limit: {
          type: "integer",
          description: `Max results (default ${DEFAULT_LIMIT}, cap 20)`,
        },
        lens: {
          type: "string",
          description:
            "Optional lens name from the lenses/ directory (ranking profile)",
        },
      },
      required: ["query"],
    },
  },
];

async function lensFor(name) {
  const file = join(ROOT, "lenses", `${(name || "default").replace(/[^\w-]/g, "")}.json`);
  try {
    return await loadLens(file);
  } catch {
    return normalizeLens({ name: "default" });
  }
}

function formatResults(payload) {
  if (!payload.results.length) return "No results.";
  const lines = payload.results.map((r, i) => {
    const snippet = (r.snippet || "").replace(/\s+/g, " ").slice(0, 300);
    return `${i + 1}. ${r.title}\n   ${r.url}\n   ${snippet}`;
  });
  const failed = payload.adapters.filter((a) => !a.ok).map((a) => a.name);
  if (failed.length) lines.push(`(backends unavailable: ${failed.join(", ")})`);
  return lines.join("\n\n");
}

async function callTool(name, args) {
  if (name !== "web_search") throw new Error(`unknown tool: ${name}`);
  const query = String(args?.query || "").trim();
  if (!query) throw new Error("query is required");
  const limit = Math.min(20, Math.max(1, Number(args?.limit) || DEFAULT_LIMIT));
  const lens = await lensFor(args?.lens);
  const payload = await metaSearch(query, lens, { limit });
  return formatResults(payload);
}

// --- newline-delimited JSON-RPC over stdio ---

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, message, code = -32000) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

const rl = createInterface({ input: process.stdin, terminal: false });

let pending = 0;
let stdinClosed = false;

function maybeExit() {
  if (stdinClosed && pending === 0) process.exit(0);
}

rl.on("line", async (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // not JSON-RPC; ignore
  }
  const { id, method, params } = msg;
  if (id === undefined) return; // notification (e.g. notifications/initialized)

  pending++;
  try {
    switch (method) {
      case "initialize":
        reply(id, {
          protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "websearch", version: "0.1.0" },
        });
        break;
      case "ping":
        reply(id, {});
        break;
      case "tools/list":
        reply(id, { tools: TOOLS });
        break;
      case "tools/call": {
        const text = await callTool(params?.name, params?.arguments);
        reply(id, { content: [{ type: "text", text }], isError: false });
        break;
      }
      default:
        replyError(id, `method not found: ${method}`, -32601);
    }
  } catch (err) {
    if (method === "tools/call") {
      // Tool failures go back as tool results so the model can react.
      reply(id, {
        content: [{ type: "text", text: `search failed: ${err.message}` }],
        isError: true,
      });
    } else {
      replyError(id, err.message);
    }
  } finally {
    pending--;
    maybeExit();
  }
});

// Don't die mid-search on stdin EOF: drain in-flight requests first.
rl.on("close", () => {
  stdinClosed = true;
  maybeExit();
});
