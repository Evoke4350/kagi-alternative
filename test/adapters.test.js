import test from "node:test";
import assert from "node:assert/strict";

// Clear any keys that might leak in from the host environment so that
// `adapterEnabled` reflects the documented "no key set" defaults. This must
// run before importing the adapters module (which freezes config at import).
process.env.BRAVE_API_KEY = "";
process.env.MOJEEK_API_KEY = "";
process.env.MARGINALIA_API_KEY = "";
process.env.GITHUB_TOKEN = "";
process.env.WEBSEARCH_SEARXNG_BASE_URL = "";

const { listAdapters, activeAdapters } = await import("../src/adapters/index.js");
const { parseArxivFeed } = await import("../src/adapters/arxiv.js");

test("listAdapters returns all 11 adapters", () => {
  const adapters = listAdapters();
  assert.equal(adapters.length, 11);
  const names = adapters.map((a) => a.name).sort();
  assert.deepEqual(names, [
    "arxiv",
    "brave",
    "duckduckgo",
    "github",
    "hackernews",
    "marginalia",
    "mojeek",
    "searxng",
    "stackexchange",
    "wikipedia",
    "wiktionary",
  ]);
});

test("requiresKey is true only for brave, mojeek, marginalia", () => {
  const adapters = listAdapters();
  const requiring = adapters.filter((a) => a.requiresKey).map((a) => a.name).sort();
  assert.deepEqual(requiring, ["brave", "marginalia", "mojeek"]);
});

test("each adapter exposes a capabilities array", () => {
  const adapters = listAdapters();
  for (const a of adapters) {
    assert.ok(Array.isArray(a.capabilities), `${a.name} should expose capabilities`);
  }
});

test("activeAdapters excludes key-gated adapters when keys are unset", () => {
  const active = activeAdapters().map((a) => a.name);
  // brave, mojeek, marginalia require keys and searxng requires a base URL,
  // so without env config those four should be filtered out.
  assert.ok(!active.includes("brave"));
  assert.ok(!active.includes("mojeek"));
  assert.ok(!active.includes("marginalia"));
  assert.ok(!active.includes("searxng"));
  // Keyless adapters should remain enabled.
  for (const name of [
    "wikipedia",
    "hackernews",
    "stackexchange",
    "github",
    "arxiv",
    "duckduckgo",
    "wiktionary",
  ]) {
    assert.ok(active.includes(name), `${name} should be active`);
  }
});

test("parseArxivFeed extracts title, summary, id, published", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>arXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2301.00001v1</id>
    <updated>2023-01-02T00:00:00Z</updated>
    <published>2023-01-01T00:00:00Z</published>
    <title>Attention Is Some You Need</title>
    <summary>A paper about attention &amp; transformers.</summary>
    <author><name>Doe, J.</name></author>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2302.00002v1</id>
    <updated>2023-02-02T00:00:00Z</updated>
    <published>2023-02-01T00:00:00Z</published>
    <title>Second Paper</title>
    <summary>Another &lt;abstract&gt; here.</summary>
  </entry>
</feed>`;

  const results = parseArxivFeed(xml);
  assert.equal(results.length, 2);

  assert.equal(results[0].url, "http://arxiv.org/abs/2301.00001v1");
  assert.equal(results[0].title, "Attention Is Some You Need");
  assert.equal(results[0].snippet, "A paper about attention & transformers.");
  assert.equal(results[0].publishedAt, "2023-01-01T00:00:00Z");
  assert.equal(results[0].source, "arxiv");

  assert.equal(results[1].url, "http://arxiv.org/abs/2302.00002v1");
  assert.equal(results[1].title, "Second Paper");
  assert.equal(results[1].snippet, "Another here.");
  assert.equal(results[1].publishedAt, "2023-02-01T00:00:00Z");
});

test("parseArxivFeed returns empty for malformed input", () => {
  assert.deepEqual(parseArxivFeed(""), []);
  assert.deepEqual(parseArxivFeed("<feed></feed>"), []);
});
