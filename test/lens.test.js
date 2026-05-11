import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLens } from "../src/search/lens.js";

test("normalizes string and object boost entries", () => {
  const lens = normalizeLens({
    boost: ["github.com", { host: "wikipedia.org", factor: 2 }],
    downrank: ["medium.com", { host: "old.com", factor: 0.1 }],
  });
  assert.equal(lens.boost.get("github.com"), 1.5);
  assert.equal(lens.boost.get("wikipedia.org"), 2);
  assert.equal(lens.downrank.get("medium.com"), 0.5);
  assert.equal(lens.downrank.get("old.com"), 0.1);
});

test("strips scheme and path from host input", () => {
  const lens = normalizeLens({ block: ["https://www.bad.com/some/path"] });
  assert.ok(lens.block.has("bad.com"));
});
