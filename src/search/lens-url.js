const MAX_LENGTH = 4096;
const MAX_ENTRIES = 200;
const MIN_FACTOR = 0.01;
const MAX_FACTOR = 100;
const ALLOWED_KEYS = new Set(["name", "block", "boost", "downrank"]);

export function encodeLensToUrl(lens) {
  const json = JSON.stringify(lens);
  return Buffer.from(json, "utf8").toString("base64url").replace(/=+$/, "");
}

export function decodeLensFromUrl(str) {
  if (!str || typeof str !== "string") return null;
  if (str.length > MAX_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(str)) return null;

  let data;
  try {
    const json = Buffer.from(str, "base64url").toString("utf8");
    data = JSON.parse(json);
  } catch {
    return null;
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  for (const key of Object.keys(data)) {
    if (!ALLOWED_KEYS.has(key)) return null;
  }

  if (data.name !== undefined && typeof data.name !== "string") return null;

  if (data.block !== undefined) {
    if (!Array.isArray(data.block)) return null;
    if (data.block.length > MAX_ENTRIES) return null;
    if (!data.block.every((b) => typeof b === "string")) return null;
  }

  for (const key of ["boost", "downrank"]) {
    if (data[key] === undefined) continue;
    if (!Array.isArray(data[key])) return null;
    if (data[key].length > MAX_ENTRIES) return null;
    for (const item of data[key]) {
      if (typeof item === "string") continue;
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      if (typeof item.host !== "string") return null;
      if (!Number.isFinite(item.factor)) return null;
      if (item.factor < MIN_FACTOR || item.factor > MAX_FACTOR) return null;
      for (const k of Object.keys(item)) {
        if (k !== "host" && k !== "factor") return null;
      }
    }
  }

  return data;
}
