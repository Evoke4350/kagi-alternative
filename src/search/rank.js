import { tokenize } from "../text.js";
import { canonicalKey } from "../url.js";

export function aggregate(query, perAdapterResults, adapters, weightOverrides) {
  const tokens = tokenize(query);
  const phrase = query.toLowerCase().trim();
  const baseWeights = new Map(adapters.map((a) => [a.name, a.weight ?? 1]));
  const overrides = weightOverrides instanceof Map ? weightOverrides : null;
  const weightOf = (name) => {
    if (overrides && overrides.has(name)) return overrides.get(name);
    return baseWeights.get(name) ?? 1;
  };
  const byKey = new Map();

  for (const { name, results } of perAdapterResults) {
    const adapterWeight = weightOf(name);
    results.forEach((result, position) => {
      const key = canonicalKey(result.url);
      const rrf = 1 / (60 + position);
      const lexical = scoreText(result, tokens, phrase);
      const total = adapterWeight * (rrf * 100 + lexical);
      const contribution = {
        name,
        position,
        rrf: Number((rrf * 100).toFixed(4)),
        lexical,
        weight: adapterWeight,
        total: Number(total.toFixed(4)),
      };

      const existing = byKey.get(key);
      if (existing) {
        existing.score += total;
        existing.sources.add(name);
        existing.contributions.push(contribution);
        if (!existing.snippet && result.snippet) existing.snippet = result.snippet;
        if (!existing.publishedAt && result.publishedAt) existing.publishedAt = result.publishedAt;
      } else {
        byKey.set(key, {
          url: result.url,
          title: result.title,
          snippet: result.snippet,
          publishedAt: result.publishedAt || null,
          meta: result.meta,
          sources: new Set([name]),
          contributions: [contribution],
          score: total,
        });
      }
    });
  }

  const list = [...byKey.values()].map((item) => ({
    ...item,
    sources: [...item.sources],
    diversityBoost: item.sources.size > 1 ? 1 + 0.15 * (item.sources.size - 1) : 1,
  }));

  for (const item of list) item.score *= item.diversityBoost;
  return list;
}

export function applyLensAndSort(list, lens) {
  const out = [];
  for (const item of list) {
    const host = hostOf(item.url);
    if (!host) continue;
    if (anyMatch(host, lens.block)) continue;
    let factor = 1;
    for (const [pattern, value] of lens.boost) if (hostMatches(host, pattern)) factor *= value;
    for (const [pattern, value] of lens.downrank) if (hostMatches(host, pattern)) factor *= value;
    out.push({ ...item, host, lensFactor: factor, score: item.score * factor });
  }
  return out.sort((a, b) => b.score - a.score);
}

function scoreText(result, tokens, phrase) {
  if (!tokens.length) return 0;
  const title = (result.title || "").toLowerCase();
  const snippet = (result.snippet || "").toLowerCase();
  let s = 0;
  if (phrase && title.includes(phrase)) s += 30;
  if (phrase && snippet.includes(phrase)) s += 8;
  for (const t of tokens) {
    if (title === t) s += 18;
    else if (title.startsWith(t)) s += 10;
    else if (title.includes(t)) s += 6;
    if (snippet.includes(t)) s += 2;
  }
  return s;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function anyMatch(host, set) {
  for (const pattern of set) if (hostMatches(host, pattern)) return true;
  return false;
}

function hostMatches(host, pattern) {
  if (!pattern) return false;
  if (pattern === host) return true;
  return host.endsWith(`.${pattern}`);
}
