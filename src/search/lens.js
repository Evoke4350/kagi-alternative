import { readFile } from "node:fs/promises";

export async function loadLens(path) {
  try {
    const text = await readFile(path, "utf8");
    const data = JSON.parse(text);
    return normalizeLens(data);
  } catch {
    return normalizeLens({});
  }
}

export function normalizeLens(data) {
  const block = new Set((data.block || []).map(normalizeHost).filter(Boolean));
  const boost = new Map();
  for (const item of data.boost || []) {
    if (typeof item === "string") boost.set(normalizeHost(item), 1.5);
    else if (item && item.host) boost.set(normalizeHost(item.host), Number(item.factor) || 1.5);
  }
  const downrank = new Map();
  for (const item of data.downrank || []) {
    if (typeof item === "string") downrank.set(normalizeHost(item), 0.5);
    else if (item && item.host) downrank.set(normalizeHost(item.host), Number(item.factor) || 0.5);
  }
  return { block, boost, downrank, name: data.name || "default" };
}

export function applyLens(result, lens) {
  const host = hostOf(result.url);
  if (!host) return null;
  if (matches(host, lens.block)) return null;
  let factor = 1;
  for (const [pattern, value] of lens.boost) if (hostMatches(host, pattern)) factor *= value;
  for (const [pattern, value] of lens.downrank) if (hostMatches(host, pattern)) factor *= value;
  return { ...result, lensFactor: factor };
}

function matches(host, set) {
  for (const pattern of set) if (hostMatches(host, pattern)) return true;
  return false;
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

function normalizeHost(value) {
  return String(value || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}
