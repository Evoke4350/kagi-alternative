import test from "node:test";
import assert from "node:assert/strict";
import { metaSearchStream } from "../src/search/aggregate.js";
import { normalizeLens } from "../src/search/lens.js";

function makeAdapter(name, weight, delay, results) {
  return {
    name,
    weight,
    capabilities: [],
    async search() {
      await new Promise((r) => setTimeout(r, delay));
      return results;
    },
  };
}

function makeFailingAdapter(name, weight, delay, message) {
  return {
    name,
    weight,
    capabilities: [],
    async search() {
      await new Promise((r) => setTimeout(r, delay));
      throw new Error(message);
    },
  };
}

function collectEvents() {
  const events = [];
  return {
    events,
    onEvent: (name, data) => events.push({ name, data }),
  };
}

test("emits start, adapter, ranked, ... , done in order with three fake adapters", async () => {
  const a = makeAdapter("alpha", 1, 20, [
    { url: "https://example.com/a", title: "Alpha doc", snippet: "alpha" },
  ]);
  const b = makeAdapter("beta", 1, 40, [
    { url: "https://example.com/a", title: "Alpha doc", snippet: "alpha" },
  ]);
  const c = makeAdapter("gamma", 1, 60, [
    { url: "https://example.com/c", title: "Gamma piece", snippet: "gamma" },
  ]);

  const { events, onEvent } = collectEvents();
  const lens = normalizeLens({});
  await metaSearchStream(
    "alpha",
    lens,
    { adapters: [a, b, c], adapterContext: () => ({}), cache: false, limit: 10 },
    onEvent,
  );

  const names = events.map((e) => e.name);
  assert.equal(names[0], "start");
  assert.equal(names[names.length - 1], "done");

  // Expect: start, then 3 (adapter, ranked) pairs, then done.
  assert.equal(events.length, 1 + 3 * 2 + 1, `got events: ${names.join(",")}`);
  assert.deepEqual(names, ["start", "adapter", "ranked", "adapter", "ranked", "adapter", "ranked", "done"]);
});

test("start event includes activeAdapters and parsed query", async () => {
  const a = makeAdapter("alpha", 1, 5, []);
  const { events, onEvent } = collectEvents();
  await metaSearchStream(
    "hello world",
    normalizeLens({}),
    { adapters: [a], adapterContext: () => ({}), cache: false },
    onEvent,
  );
  const start = events[0];
  assert.equal(start.name, "start");
  assert.equal(start.data.raw, "hello world");
  assert.deepEqual(start.data.activeAdapters, ["alpha"]);
  assert.ok(typeof start.data.startedAt === "number");
});

test("final ranked has all 3 adapter contributions for merged URL", async () => {
  const url = "https://example.com/shared";
  const a = makeAdapter("alpha", 1, 10, [{ url, title: "Shared", snippet: "shared" }]);
  const b = makeAdapter("beta", 1, 20, [{ url, title: "Shared", snippet: "shared" }]);
  const c = makeAdapter("gamma", 1, 30, [{ url, title: "Shared", snippet: "shared" }]);

  const { events, onEvent } = collectEvents();
  await metaSearchStream(
    "shared",
    normalizeLens({}),
    { adapters: [a, b, c], adapterContext: () => ({}), cache: false },
    onEvent,
  );

  const rankedEvents = events.filter((e) => e.name === "ranked");
  const last = rankedEvents[rankedEvents.length - 1];
  assert.equal(last.data.results.length, 1);
  const r = last.data.results[0];
  assert.equal(r.url, url);
  assert.equal(r.contributions.length, 3);
  assert.equal(r.explain.byAdapter.length, 3);
  const names = r.explain.byAdapter.map((c) => c.name).sort();
  assert.deepEqual(names, ["alpha", "beta", "gamma"]);
});

test("ranked event count grows as adapters complete", async () => {
  const a = makeAdapter("alpha", 1, 10, [{ url: "https://a.com/", title: "A", snippet: "" }]);
  const b = makeAdapter("beta", 1, 20, [{ url: "https://b.com/", title: "B", snippet: "" }]);
  const c = makeAdapter("gamma", 1, 30, [{ url: "https://c.com/", title: "C", snippet: "" }]);

  const { events, onEvent } = collectEvents();
  await metaSearchStream(
    "x",
    normalizeLens({}),
    { adapters: [a, b, c], adapterContext: () => ({}), cache: false },
    onEvent,
  );

  const rankedEvents = events.filter((e) => e.name === "ranked");
  assert.equal(rankedEvents.length, 3);
  assert.equal(rankedEvents[0].data.adaptersReporting, 1);
  assert.equal(rankedEvents[1].data.adaptersReporting, 2);
  assert.equal(rankedEvents[2].data.adaptersReporting, 3);
  assert.equal(rankedEvents[2].data.adaptersTotal, 3);
});

test("failing adapter still emits an adapter event with error message", async () => {
  const a = makeAdapter("alpha", 1, 5, [{ url: "https://a.com/", title: "A", snippet: "" }]);
  const b = makeFailingAdapter("beta", 1, 10, "boom");

  const { events, onEvent } = collectEvents();
  await metaSearchStream(
    "x",
    normalizeLens({}),
    { adapters: [a, b], adapterContext: () => ({}), cache: false },
    onEvent,
  );

  const adapterEvents = events.filter((e) => e.name === "adapter");
  assert.equal(adapterEvents.length, 2);
  const failed = adapterEvents.find((e) => e.data.name === "beta");
  assert.equal(failed.data.ok, false);
  assert.equal(failed.data.error, "boom");
  assert.equal(failed.data.count, 0);
});

test("done is emitted exactly once with totalMs and cached flag", async () => {
  const a = makeAdapter("alpha", 1, 5, []);
  const { events, onEvent } = collectEvents();
  await metaSearchStream("x", normalizeLens({}), { adapters: [a], adapterContext: () => ({}), cache: false }, onEvent);
  const done = events.filter((e) => e.name === "done");
  assert.equal(done.length, 1);
  assert.equal(typeof done[0].data.totalMs, "number");
  assert.equal(done[0].data.cached, false);
});

test("empty adapter list still emits start, an empty ranked, and done", async () => {
  const { events, onEvent } = collectEvents();
  await metaSearchStream("x", normalizeLens({}), { adapters: [], adapterContext: () => ({}), cache: false }, onEvent);
  const names = events.map((e) => e.name);
  assert.deepEqual(names, ["start", "ranked", "done"]);
  const ranked = events.find((e) => e.name === "ranked");
  assert.deepEqual(ranked.data.results, []);
  assert.equal(ranked.data.adaptersTotal, 0);
});

test("each ranked result includes explain", async () => {
  const a = makeAdapter("alpha", 1, 5, [{ url: "https://a.com/", title: "A", snippet: "" }]);
  const { events, onEvent } = collectEvents();
  await metaSearchStream("x", normalizeLens({}), { adapters: [a], adapterContext: () => ({}), cache: false }, onEvent);
  const rankedEvents = events.filter((e) => e.name === "ranked");
  const last = rankedEvents[rankedEvents.length - 1];
  assert.equal(last.data.results.length, 1);
  const r = last.data.results[0];
  assert.ok(r.explain, "result should carry explain");
  assert.equal(typeof r.explain.finalScore, "number");
  assert.ok(Array.isArray(r.explain.byAdapter));
});

test("postFilter with -site: excludes matching results from streamed output", async () => {
  const a = makeAdapter("alpha", 1, 5, [
    { url: "https://reddit.com/x", title: "Reddit", snippet: "" },
    { url: "https://example.com/y", title: "Example", snippet: "" },
  ]);
  const { events, onEvent } = collectEvents();
  await metaSearchStream(
    "-site:reddit.com foo",
    normalizeLens({}),
    { adapters: [a], adapterContext: () => ({}), cache: false },
    onEvent,
  );
  const rankedEvents = events.filter((e) => e.name === "ranked");
  const last = rankedEvents[rankedEvents.length - 1];
  const urls = last.data.results.map((r) => r.url);
  assert.ok(!urls.some((u) => u.includes("reddit.com")), `reddit should be filtered out, got ${urls.join(",")}`);
  assert.ok(urls.some((u) => u.includes("example.com")));
});
