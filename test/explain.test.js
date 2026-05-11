import test from "node:test";
import assert from "node:assert/strict";
import { explainResult } from "../src/search/explain.js";
import { normalizeLens } from "../src/search/lens.js";

const adapters = [
  { name: "brave", weight: 1.0 },
  { name: "wikipedia", weight: 0.8 },
];

test("finalScore equals sum(contributions.total) * diversityBoost * lensFactor", () => {
  const result = {
    url: "https://example.com/x",
    host: "example.com",
    contributions: [
      { name: "brave", position: 2, rrf: 1.6129, lexical: 18, weight: 1.0, total: 19.61 },
      { name: "wikipedia", position: 0, rrf: 1.6666, lexical: 24, weight: 0.8, total: 20.53 },
    ],
    diversityBoost: 1.15,
    lensFactor: 1.2,
  };
  const explain = explainResult(result, adapters);
  const expectedSum = 19.61 + 20.53;
  const expected = expectedSum * 1.15 * 1.2;
  // allow tiny floating drift
  assert.ok(Math.abs(explain.finalScore - expected) < 0.0001, `got ${explain.finalScore}, want ${expected}`);
});

test("byAdapter preserves shape of contributions", () => {
  const result = {
    url: "https://example.com/x",
    host: "example.com",
    contributions: [
      { name: "brave", position: 2, rrf: 1.6129, lexical: 18, weight: 1.0, total: 19.61 },
    ],
    diversityBoost: 1,
    lensFactor: 1,
  };
  const explain = explainResult(result, adapters);
  assert.equal(explain.byAdapter.length, 1);
  assert.deepEqual(explain.byAdapter[0], {
    name: "brave",
    position: 2,
    rrf: 1.6129,
    lexical: 18,
    weight: 1.0,
    total: 19.61,
  });
});

test("multiSourceDiversity reflects result.diversityBoost", () => {
  const result = {
    url: "https://example.com/x",
    host: "example.com",
    contributions: [],
    diversityBoost: 1.3,
    lensFactor: 1.0,
  };
  const explain = explainResult(result, adapters);
  assert.equal(explain.multiSourceDiversity, 1.3);
});

test("lensFactor reflects result.lensFactor", () => {
  const result = {
    url: "https://example.com/x",
    host: "example.com",
    contributions: [],
    diversityBoost: 1,
    lensFactor: 1.4,
  };
  const explain = explainResult(result, adapters);
  assert.equal(explain.lensFactor, 1.4);
});

test("lensReason describes boost match when host is boosted", () => {
  const lens = normalizeLens({ boost: [{ host: "github.com", factor: 1.4 }] });
  const result = {
    url: "https://github.com/foo/bar",
    host: "github.com",
    contributions: [],
    diversityBoost: 1,
    lensFactor: 1.4,
  };
  const explain = explainResult(result, adapters, lens);
  assert.ok(explain.lensReason, "should produce a lensReason");
  assert.match(explain.lensReason, /boost/i);
  assert.match(explain.lensReason, /github\.com/);
});

test("lensReason describes downrank match when host is downranked", () => {
  const lens = normalizeLens({ downrank: [{ host: "medium.com", factor: 0.5 }] });
  const result = {
    url: "https://medium.com/x",
    host: "medium.com",
    contributions: [],
    diversityBoost: 1,
    lensFactor: 0.5,
  };
  const explain = explainResult(result, adapters, lens);
  assert.ok(explain.lensReason);
  assert.match(explain.lensReason, /downrank/i);
  assert.match(explain.lensReason, /medium\.com/);
});

test("lensReason is null when lensFactor === 1", () => {
  const lens = normalizeLens({ boost: ["github.com"] });
  const result = {
    url: "https://example.com/",
    host: "example.com",
    contributions: [],
    diversityBoost: 1,
    lensFactor: 1,
  };
  const explain = explainResult(result, adapters, lens);
  assert.equal(explain.lensReason, null);
});

test("lensReason is null when no lens passed", () => {
  const result = {
    url: "https://example.com/",
    host: "example.com",
    contributions: [],
    diversityBoost: 1,
    lensFactor: 1.4,
  };
  const explain = explainResult(result, adapters);
  assert.equal(explain.lensReason, null);
});

test("lensReason matches subdomain hosts against patterns", () => {
  const lens = normalizeLens({ boost: [{ host: "github.com", factor: 1.4 }] });
  const result = {
    url: "https://docs.github.com/foo",
    host: "docs.github.com",
    contributions: [],
    diversityBoost: 1,
    lensFactor: 1.4,
  };
  const explain = explainResult(result, adapters, lens);
  assert.ok(explain.lensReason);
  assert.match(explain.lensReason, /github\.com/);
});

test("handles missing contributions gracefully", () => {
  const result = {
    url: "https://example.com/",
    host: "example.com",
    diversityBoost: 1,
    lensFactor: 1,
  };
  const explain = explainResult(result, adapters);
  assert.equal(explain.finalScore, 0);
  assert.deepEqual(explain.byAdapter, []);
});
