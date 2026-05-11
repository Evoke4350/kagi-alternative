import test from "node:test";
import assert from "node:assert/strict";
import { encodeLensToUrl, decodeLensFromUrl } from "../src/search/lens-url.js";

test("round-trip simple lens", () => {
  const lens = { name: "mine", block: ["bad.com"], boost: ["good.com"], downrank: ["meh.com"] };
  const encoded = encodeLensToUrl(lens);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  const decoded = decodeLensFromUrl(encoded);
  assert.deepEqual(decoded, lens);
});

test("round-trip lens with mixed string/object boost entries", () => {
  const lens = {
    name: "mix",
    block: [],
    boost: ["github.com", { host: "wikipedia.org", factor: 2 }],
    downrank: [{ host: "old.com", factor: 0.1 }],
  };
  const encoded = encodeLensToUrl(lens);
  const decoded = decodeLensFromUrl(encoded);
  assert.deepEqual(decoded, lens);
});

test("encoded string has no trailing '=' padding", () => {
  const lens = { name: "a" };
  const encoded = encodeLensToUrl(lens);
  assert.ok(!encoded.includes("="));
});

test("decode rejects oversize input (>4096)", () => {
  const big = "A".repeat(5000);
  assert.equal(decodeLensFromUrl(big), null);
});

test("decode rejects non-base64url characters", () => {
  assert.equal(decodeLensFromUrl("not valid!!!"), null);
});

test("decode rejects unknown top-level keys", () => {
  const bad = { name: "x", block: [], evil: "yes" };
  const encoded = Buffer.from(JSON.stringify(bad)).toString("base64url").replace(/=+$/, "");
  assert.equal(decodeLensFromUrl(encoded), null);
});

test("decode rejects malformed JSON", () => {
  const encoded = Buffer.from("not json").toString("base64url").replace(/=+$/, "");
  assert.equal(decodeLensFromUrl(encoded), null);
});

test("decode rejects block array containing non-strings", () => {
  const bad = { block: ["ok.com", 123] };
  const encoded = Buffer.from(JSON.stringify(bad)).toString("base64url").replace(/=+$/, "");
  assert.equal(decodeLensFromUrl(encoded), null);
});

test("decode rejects out-of-range factor", () => {
  const bad = { boost: [{ host: "x.com", factor: 1000 }] };
  const encoded = Buffer.from(JSON.stringify(bad)).toString("base64url").replace(/=+$/, "");
  assert.equal(decodeLensFromUrl(encoded), null);
});

test("decode rejects negative factor", () => {
  const bad = { boost: [{ host: "x.com", factor: -1 }] };
  const encoded = Buffer.from(JSON.stringify(bad)).toString("base64url").replace(/=+$/, "");
  assert.equal(decodeLensFromUrl(encoded), null);
});

test("decode rejects more than 200 block entries", () => {
  const bad = { block: Array.from({ length: 201 }, (_, i) => `host${i}.com`) };
  const encoded = Buffer.from(JSON.stringify(bad)).toString("base64url").replace(/=+$/, "");
  assert.equal(decodeLensFromUrl(encoded), null);
});

test("decode accepts valid factor at boundary", () => {
  const lens = { boost: [{ host: "x.com", factor: 100 }] };
  const encoded = encodeLensToUrl(lens);
  assert.deepEqual(decodeLensFromUrl(encoded), lens);
});

test("decode rejects null input", () => {
  assert.equal(decodeLensFromUrl(""), null);
  assert.equal(decodeLensFromUrl(null), null);
  assert.equal(decodeLensFromUrl(undefined), null);
});
