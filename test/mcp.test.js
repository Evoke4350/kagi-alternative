// Protocol-level tests for the MCP stdio server: spawn it, speak JSON-RPC.
// No network calls — only initialize / tools/list / bad-input paths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), "../bin/websearch-mcp.js");

async function rpc(messages) {
  const proc = spawn(process.execPath, [BIN], { stdio: ["pipe", "pipe", "inherit"] });
  proc.stdin.write(messages.map((m) => JSON.stringify(m)).join("\n") + "\n");
  proc.stdin.end();
  let out = "";
  proc.stdout.on("data", (d) => { out += d; });
  await once(proc, "exit");
  return out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

test("initialize handshake", async () => {
  const [res] = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
  ]);
  assert.equal(res.id, 1);
  assert.equal(res.result.serverInfo.name, "websearch");
  assert.ok(res.result.capabilities.tools);
});

test("tools/list exposes web_search with a query arg", async () => {
  const replies = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]);
  const list = replies.find((r) => r.id === 2);
  const tool = list.result.tools.find((t) => t.name === "web_search");
  assert.ok(tool);
  assert.deepEqual(tool.inputSchema.required, ["query"]);
});

test("tools/call with empty query returns a tool error, not a crash", async () => {
  const replies = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "web_search", arguments: { query: "" } } },
  ]);
  const call = replies.find((r) => r.id === 2);
  assert.equal(call.result.isError, true);
  assert.match(call.result.content[0].text, /query is required/);
});

test("unknown method gets -32601", async () => {
  const replies = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "resources/list" },
  ]);
  const bad = replies.find((r) => r.id === 2);
  assert.equal(bad.error.code, -32601);
});

test("notifications are ignored silently", async () => {
  const replies = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "ping" },
  ]);
  assert.equal(replies.length, 2);
  assert.deepEqual(replies.find((r) => r.id === 2).result, {});
});
