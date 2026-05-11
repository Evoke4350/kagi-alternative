import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, highlight, stripHtml, tokenize, truncate } from "../src/text.js";

test("tokenize lowercases, splits, removes stopwords", () => {
  assert.deepEqual(tokenize("The Quick Brown Fox"), ["quick", "brown", "fox"]);
});

test("stripHtml removes tags and collapses whitespace", () => {
  assert.equal(stripHtml("<p>hello <b>world</b></p>"), "hello world");
});

test("escapeHtml escapes special chars", () => {
  assert.equal(escapeHtml("<a>&\"'"), "&lt;a&gt;&amp;&quot;&#39;");
});

test("truncate adds ellipsis only when over max", () => {
  assert.equal(truncate("hi", 5), "hi");
  assert.equal(truncate("hello world", 5), "hell…");
});

test("highlight wraps matched tokens in mark", () => {
  const out = highlight("Quick brown fox", ["quick", "fox"]);
  assert.ok(out.includes("<mark>Quick</mark>"));
  assert.ok(out.includes("<mark>fox</mark>"));
});
