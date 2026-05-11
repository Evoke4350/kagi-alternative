import { activeAdapters, adapterContext } from "../adapters/index.js";
import { config } from "../config.js";
import { aggregate, applyLensAndSort } from "./rank.js";
import { getCached, makeCacheKey, setCached } from "./cache.js";
import { record, snapshot } from "./stats.js";
import { explainResult } from "./explain.js";

// Defensive import of operators.js — another agent is building it in parallel.
// If absent at module load, fall back to identity-like helpers so the file still
// imports cleanly. Tests can still exercise the streaming path via fakes.
let parseQuery, adapterFilter, postFilter;
try {
  const mod = await import("./operators.js");
  parseQuery = mod.parseQuery;
  adapterFilter = mod.adapterFilter;
  postFilter = mod.postFilter;
} catch {
  parseQuery = (raw) => ({
    query: raw,
    raw,
    bang: null,
    site: { include: [], exclude: [] },
    lang: [],
    before: null,
    after: null,
    type: [],
    minus: [],
    chips: [],
  });
  adapterFilter = (_parsed, list) => list.map((a) => a.name);
  postFilter = (results) => results;
}

export async function metaSearch(query, lens, options = {}) {
  const limit = Math.min(50, Number(options.limit || 20));
  const cacheKey = makeCacheKey(["meta", query, lens.name, limit]);

  if (config.cache.enabled) {
    const hit = await getCached(config.cache.dir, cacheKey);
    if (hit) return { ...hit, cached: true };
  }

  const adapters = activeAdapters();
  const tasks = adapters.map(async (adapter) => {
    const ctx = adapterContext(adapter.name);
    const start = Date.now();
    try {
      const results = await adapter.search(query, ctx);
      record(adapter.name, true, Date.now() - start);
      return { name: adapter.name, results, ok: true };
    } catch (error) {
      record(adapter.name, false, Date.now() - start);
      return { name: adapter.name, results: [], ok: false, error: error.message };
    }
  });

  const settled = await Promise.all(tasks);
  const aggregated = aggregate(query, settled, adapters);
  const ranked = applyLensAndSort(aggregated, lens);

  const payload = {
    query,
    lens: lens.name,
    adapters: settled.map((r) => ({ name: r.name, ok: r.ok, count: r.results.length, error: r.error || null })),
    results: ranked.slice(0, limit),
    totalCandidates: aggregated.length,
    cached: false,
  };

  if (config.cache.enabled) await setCached(config.cache.dir, cacheKey, payload, config.cache.ttlMs);
  return payload;
}

// Streaming variant: emits events as adapters complete instead of returning a
// single payload. `onEvent(name, data)` is called by the function for every
// event; the HTTP layer translates those into SSE frames.
//
// Events emitted, in order:
//   - "start"   once at the top with parsed query + active adapter list
//   - "adapter" once per adapter as it settles
//   - "ranked"  re-emitted after each "adapter" with the current best top-N
//   - "done"    once at the bottom
//
// On a cache hit we emit start -> ranked -> done and skip the fan-out entirely.
export async function metaSearchStream(query, lens, options = {}, onEvent) {
  const startedAt = Date.now();
  const limit = Math.min(50, Number(options.limit || 20));
  const emit = typeof onEvent === "function" ? onEvent : () => {};

  const parsed = parseQuery(query);
  const adapterList = Array.isArray(options.adapters) ? options.adapters : activeAdapters();
  const ctxFn = typeof options.adapterContext === "function" ? options.adapterContext : adapterContext;

  // Determine which adapters get to run. With a !bang or type:, adapterFilter
  // returns a subset by name; we then filter the adapter objects down.
  const allowedNames = new Set(adapterFilter(parsed, adapterList));
  const filteredAdapters = adapterList.filter((a) => allowedNames.has(a.name));

  // Cache: only safe to use when no operators are present that would alter the
  // result set post-fetch (site:, -site:, before:, after:, type:, lang:, -word,
  // and bang restrictions). The cached payload is built against the raw query.
  const operatorsActive = hasActiveOperators(parsed);
  const cacheKey = makeCacheKey(["meta-stream", query, lens.name, limit]);
  const canUseCache = config.cache.enabled && !operatorsActive && options.cache !== false;

  emit("start", {
    query: parsed.query,
    raw: query,
    operators: parsed,
    lens: lens.name,
    activeAdapters: filteredAdapters.map((a) => a.name),
    startedAt,
  });

  if (canUseCache) {
    const hit = await getCached(config.cache.dir, cacheKey);
    if (hit) {
      emit("ranked", {
        results: hit.results || [],
        totalCandidates: hit.totalCandidates ?? (hit.results ? hit.results.length : 0),
        adaptersReporting: filteredAdapters.length,
        adaptersTotal: filteredAdapters.length,
      });
      emit("done", { totalMs: Date.now() - startedAt, cached: true });
      return;
    }
  }

  if (filteredAdapters.length === 0) {
    emit("ranked", {
      results: [],
      totalCandidates: 0,
      adaptersReporting: 0,
      adaptersTotal: 0,
    });
    emit("done", { totalMs: Date.now() - startedAt, cached: false });
    return;
  }

  // Compute runtime weight overrides from latency stats. Adapters with fewer
  // than 5 runs keep their static weight.
  const weightOverrides = computeWeightOverrides(filteredAdapters, snapshot());

  // Fan out and merge progressively. We resolve each task individually rather
  // than awaiting Promise.all up-front so we can react as each one settles.
  const settled = [];
  let completed = 0;

  const tasks = filteredAdapters.map((adapter) => {
    const ctx = ctxFn(adapter.name);
    const start = Date.now();
    const run = Promise.resolve().then(() => adapter.search(parsed.query, ctx));
    return run.then(
      (results) => {
        const ms = Date.now() - start;
        record(adapter.name, true, ms);
        const entry = { name: adapter.name, results: results || [], ok: true, ms };
        settled.push(entry);
        completed += 1;
        handleAdapterSettled(entry, null);
      },
      (error) => {
        const ms = Date.now() - start;
        record(adapter.name, false, ms);
        const entry = { name: adapter.name, results: [], ok: false, error, ms };
        settled.push(entry);
        completed += 1;
        handleAdapterSettled(entry, error);
      },
    );
  });

  function handleAdapterSettled(entry, error) {
    emit("adapter", {
      name: entry.name,
      ok: entry.ok,
      count: entry.results.length,
      ms: entry.ms,
      error: error ? (error.message || String(error)) : null,
    });

    const aggregated = aggregate(parsed.query, settled, filteredAdapters, weightOverrides);
    const ranked = applyLensAndSort(aggregated, lens);
    const filtered = postFilter(ranked, parsed);
    const top = filtered.slice(0, limit).map((r) => ({
      ...r,
      explain: explainResult(r, filteredAdapters, lens),
    }));

    emit("ranked", {
      results: top,
      totalCandidates: aggregated.length,
      adaptersReporting: completed,
      adaptersTotal: filteredAdapters.length,
    });
  }

  await Promise.all(tasks);

  // Build the final payload, mirroring metaSearch shape for cache compatibility.
  const aggregated = aggregate(parsed.query, settled, filteredAdapters, weightOverrides);
  const ranked = applyLensAndSort(aggregated, lens);
  const filtered = postFilter(ranked, parsed);
  const top = filtered.slice(0, limit).map((r) => ({
    ...r,
    explain: explainResult(r, filteredAdapters, lens),
  }));

  const payload = {
    query,
    lens: lens.name,
    adapters: settled.map((r) => ({
      name: r.name,
      ok: r.ok,
      count: r.results.length,
      error: r.error ? (r.error.message || String(r.error)) : null,
    })),
    results: top,
    totalCandidates: aggregated.length,
    cached: false,
  };

  if (canUseCache) {
    await setCached(config.cache.dir, cacheKey, payload, config.cache.ttlMs);
  }

  emit("done", { totalMs: Date.now() - startedAt, cached: false });
}

function hasActiveOperators(parsed) {
  if (!parsed) return false;
  if (parsed.bang) return true;
  if (parsed.site && (parsed.site.include?.length || parsed.site.exclude?.length)) return true;
  if (parsed.lang?.length) return true;
  if (parsed.type?.length) return true;
  if (parsed.minus?.length) return true;
  if (parsed.before || parsed.after) return true;
  return false;
}

function computeWeightOverrides(adapters, statsSnapshot) {
  const overrides = new Map();
  for (const adapter of adapters) {
    const s = statsSnapshot.find((x) => x.name === adapter.name);
    const base = adapter.weight ?? 1;
    if (!s || s.runs < 5) continue;
    const TARGET_P50 = 400;
    const speedFactor = Math.min(1.5, TARGET_P50 / Math.max(50, s.p50ms));
    const reliability = 1 - Math.min(0.5, s.errorRate);
    overrides.set(adapter.name, base * speedFactor * reliability);
  }
  return overrides;
}
