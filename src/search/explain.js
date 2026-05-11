// Per-result rank breakdown. Pure functions over the shape produced by
// rank.js's `aggregate()` (which carries .contributions) and `applyLensAndSort()`
// (which adds .host and .lensFactor). The third argument is the optional lens,
// used solely to produce a human-readable lensReason string.

export function explainResult(result, _adapters, lens) {
  const contributions = Array.isArray(result?.contributions) ? result.contributions : [];
  const byAdapter = contributions.map((c) => ({
    name: c.name,
    position: c.position,
    rrf: c.rrf,
    lexical: c.lexical,
    weight: c.weight,
    total: c.total,
  }));
  const sum = byAdapter.reduce((a, c) => a + (Number(c.total) || 0), 0);
  const diversityBoost = Number(result?.diversityBoost ?? 1);
  const lensFactor = Number(result?.lensFactor ?? 1);
  const finalScore = sum * diversityBoost * lensFactor;

  return {
    finalScore: round(finalScore),
    byAdapter,
    multiSourceDiversity: round(diversityBoost),
    lensFactor: round(lensFactor),
    lensReason: lensReasonFor(result, lens),
  };
}

function lensReasonFor(result, lens) {
  if (!lens) return null;
  if (!result || result.lensFactor === 1 || result.lensFactor === undefined) return null;
  const host = (result.host || hostOf(result.url) || "").toLowerCase().replace(/^www\./, "");
  if (!host) return null;

  // Boost first, then downrank. If both match, surface the dominant one
  // (whichever delta from 1 is larger).
  const reasons = [];
  if (lens.boost && typeof lens.boost.forEach === "function") {
    for (const [pattern, factor] of lens.boost) {
      if (hostMatches(host, pattern)) reasons.push({ kind: "boost", pattern, factor: Number(factor) });
    }
  }
  if (lens.downrank && typeof lens.downrank.forEach === "function") {
    for (const [pattern, factor] of lens.downrank) {
      if (hostMatches(host, pattern)) reasons.push({ kind: "downrank", pattern, factor: Number(factor) });
    }
  }
  if (reasons.length === 0) return null;

  reasons.sort((a, b) => Math.abs(Math.log(b.factor || 1)) - Math.abs(Math.log(a.factor || 1)));
  const top = reasons[0];
  const sym = top.kind === "boost" ? "×" : "×";
  return `${top.kind} on ${top.pattern} (${sym}${formatFactor(top.factor)})`;
}

function hostMatches(host, pattern) {
  if (!pattern) return false;
  if (pattern === host) return true;
  return host.endsWith(`.${pattern}`);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatFactor(value) {
  if (!Number.isFinite(value)) return "1";
  // Trim trailing zeros, keep up to 2 decimals.
  return Number(value.toFixed(2)).toString();
}

function round(value) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(4));
}
