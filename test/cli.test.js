import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, formatResult, wrap } from "../bin/websearch.js";

test("parseArgs joins positional args as the query", () => {
  const out = parseArgs(["query", "string"]);
  assert.equal(out.query, "query string");
  assert.equal(out.limit, 10);
  assert.equal(out.server, "http://127.0.0.1:3040");
  assert.equal(out.json, false);
  assert.equal(typeof out.color, "boolean");
});

test("parseArgs reads --limit", () => {
  const out = parseArgs(["--limit", "5", "foo"]);
  assert.equal(out.limit, 5);
  assert.equal(out.query, "foo");
});

test("parseArgs reads --server", () => {
  const out = parseArgs(["--server", "http://example.com:9999", "bar"]);
  assert.equal(out.server, "http://example.com:9999");
  assert.equal(out.query, "bar");
});

test("parseArgs --help returns help:true", () => {
  const out = parseArgs(["--help"]);
  assert.deepEqual(out, { help: true });
});

test("parseArgs -h is an alias for --help", () => {
  const out = parseArgs(["-h"]);
  assert.deepEqual(out, { help: true });
});

test("parseArgs --json sets json flag", () => {
  const out = parseArgs(["--json", "x"]);
  assert.equal(out.json, true);
  assert.equal(out.query, "x");
});

test("parseArgs --no-color disables color", () => {
  const out = parseArgs(["--no-color", "x"]);
  assert.equal(out.color, false);
});

test("parseArgs returns error on unknown flag", () => {
  const out = parseArgs(["--bogus", "x"]);
  assert.ok(out.error);
  assert.match(out.error, /unknown flag/);
});

test("parseArgs returns error when --limit missing value", () => {
  const out = parseArgs(["--limit"]);
  assert.ok(out.error);
});

test("parseArgs returns error when --limit is not a number", () => {
  const out = parseArgs(["--limit", "abc", "x"]);
  assert.ok(out.error);
});

test("formatResult without color contains all four fields", () => {
  const out = formatResult(
    {
      title: "Example Title",
      url: "https://example.com/path",
      host: "example.com",
      sources: ["brave", "mojeek"],
      snippet: "Some short snippet about the page.",
    },
    { color: false, width: 80 },
  );
  assert.ok(out.includes("Example Title"));
  assert.ok(out.includes("https://example.com/path"));
  assert.ok(out.includes("example.com"));
  assert.ok(out.includes("brave"));
  assert.ok(out.includes("mojeek"));
  assert.ok(out.includes("Some short snippet"));
  // no ANSI escape codes
  assert.equal(out.includes("\x1b["), false);
});

test("formatResult with color includes ANSI escape codes", () => {
  const out = formatResult(
    {
      title: "T",
      url: "https://example.com/",
      host: "example.com",
      sources: ["brave"],
      snippet: "s",
    },
    { color: true, width: 80 },
  );
  assert.ok(out.includes("\x1b["));
});

test("wrap respects width and breaks on spaces", () => {
  const out = wrap("the quick brown fox jumps over the lazy dog", 20);
  const lines = out.split("\n");
  for (const line of lines) assert.ok(line.length <= 20, `line "${line}" exceeds 20`);
  // round-trips when whitespace is collapsed
  assert.equal(out.replace(/\n/g, " "), "the quick brown fox jumps over the lazy dog");
});

test("wrap hard-breaks words longer than width", () => {
  const out = wrap("abcdefghij", 4);
  assert.equal(out, "abcd\nefgh\nij");
});

test("wrap on empty input returns empty string", () => {
  assert.equal(wrap("", 80), "");
  assert.equal(wrap(undefined, 80), "");
});
