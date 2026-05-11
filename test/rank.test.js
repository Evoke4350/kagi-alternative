import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, applyLensAndSort } from "../src/search/rank.js";
import { normalizeLens } from "../src/search/lens.js";

const adapters = [
  { name: "brave", weight: 1.0 },
  { name: "wikipedia", weight: 0.8 },
  { name: "hackernews", weight: 0.6 },
];

test("dedup merges same URL across adapters and boosts via diversity", () => {
  const perAdapter = [
    { name: "brave", results: [{ url: "https://example.com/a", title: "Alpha", snippet: "alpha bravo" }] },
    { name: "wikipedia", results: [{ url: "https://example.com/a", title: "Alpha", snippet: "wiki alpha" }] },
    { name: "hackernews", results: [{ url: "https://example.com/b", title: "Bravo", snippet: "story bravo" }] },
  ];
  const list = aggregate("alpha", perAdapter, adapters);
  const a = list.find((x) => x.url === "https://example.com/a");
  const b = list.find((x) => x.url === "https://example.com/b");
  assert.equal(a.sources.length, 2);
  assert.equal(b.sources.length, 1);
  assert.ok(a.score > b.score, "multi-source result should outrank single-source result");
});

test("canonicalKey ignores tracking params and www", () => {
  const perAdapter = [
    { name: "brave", results: [{ url: "https://www.example.com/x?utm_source=foo", title: "X", snippet: "" }] },
    { name: "wikipedia", results: [{ url: "https://example.com/x", title: "X", snippet: "" }] },
  ];
  const list = aggregate("x", perAdapter, adapters);
  assert.equal(list.length, 1);
  assert.equal(list[0].sources.length, 2);
});

test("lens block removes host", () => {
  const lens = normalizeLens({ block: ["bad.com"] });
  const list = [
    { url: "https://bad.com/x", title: "Bad", snippet: "", sources: ["brave"], score: 100 },
    { url: "https://good.com/x", title: "Good", snippet: "", sources: ["brave"], score: 50 },
  ];
  const out = applyLensAndSort(list, lens);
  assert.equal(out.length, 1);
  assert.equal(out[0].host, "good.com");
});

test("lens boost increases score", () => {
  const lens = normalizeLens({ boost: [{ host: "good.com", factor: 3 }] });
  const list = [
    { url: "https://good.com/x", title: "Good", snippet: "", sources: ["brave"], score: 10 },
    { url: "https://other.com/x", title: "Other", snippet: "", sources: ["brave"], score: 20 },
  ];
  const out = applyLensAndSort(list, lens);
  assert.equal(out[0].host, "good.com");
  assert.equal(out[0].score, 30);
});

test("lens host match covers subdomains", () => {
  const lens = normalizeLens({ block: ["bad.com"] });
  const list = [{ url: "https://sub.bad.com/x", title: "Sub", snippet: "", sources: ["brave"], score: 1 }];
  assert.equal(applyLensAndSort(list, lens).length, 0);
});

test("aggregated items carry per-adapter contributions", () => {
  const perAdapter = [
    { name: "brave", results: [{ url: "https://example.com/a", title: "Alpha", snippet: "" }] },
    { name: "wikipedia", results: [{ url: "https://example.com/a", title: "Alpha", snippet: "" }] },
  ];
  const list = aggregate("alpha", perAdapter, adapters);
  const a = list.find((x) => x.url === "https://example.com/a");
  assert.ok(Array.isArray(a.contributions), "contributions should be an array");
  assert.equal(a.contributions.length, 2);
  const names = a.contributions.map((c) => c.name).sort();
  assert.deepEqual(names, ["brave", "wikipedia"]);
  for (const c of a.contributions) {
    assert.equal(typeof c.position, "number");
    assert.equal(typeof c.rrf, "number");
    assert.equal(typeof c.lexical, "number");
    assert.equal(typeof c.weight, "number");
    assert.equal(typeof c.total, "number");
  }
});

test("weightOverrides Map changes scoring", () => {
  const perAdapter = [
    { name: "brave", results: [{ url: "https://a.com/", title: "A", snippet: "" }] },
    { name: "wikipedia", results: [{ url: "https://b.com/", title: "B", snippet: "" }] },
  ];
  const baseline = aggregate("alpha", perAdapter, adapters);
  const overrides = new Map([["brave", 0.1], ["wikipedia", 5]]);
  const boosted = aggregate("alpha", perAdapter, adapters, overrides);
  const baselineBrave = baseline.find((r) => r.url === "https://a.com/");
  const boostedBrave = boosted.find((r) => r.url === "https://a.com/");
  const baselineWiki = baseline.find((r) => r.url === "https://b.com/");
  const boostedWiki = boosted.find((r) => r.url === "https://b.com/");
  assert.ok(boostedBrave.score < baselineBrave.score, "brave weight cut should lower brave-only score");
  assert.ok(boostedWiki.score > baselineWiki.score, "wikipedia weight boost should raise its score");
  assert.equal(boostedBrave.contributions[0].weight, 0.1);
  assert.equal(boostedWiki.contributions[0].weight, 5);
});
