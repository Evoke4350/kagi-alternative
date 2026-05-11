import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function makeCacheKey(parts) {
  const hash = createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  return hash.slice(0, 64);
}

export async function getCached(dir, key) {
  const file = entryPath(dir, key);
  if (!file) return null;
  try {
    const text = await readFile(file, "utf8");
    const entry = JSON.parse(text);
    if (!entry || typeof entry.expiresAt !== "number" || entry.expiresAt <= Date.now()) {
      await safeUnlink(file);
      return null;
    }
    return entry.value;
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    logCacheError("get", error);
    return null;
  }
}

export async function setCached(dir, key, value, ttlMs) {
  const file = entryPath(dir, key);
  if (!file) return;
  const ttl = Number(ttlMs);
  if (!Number.isFinite(ttl) || ttl <= 0) return;
  const entry = { expiresAt: Date.now() + ttl, value };
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify(entry), "utf8");
  } catch (error) {
    logCacheError("set", error);
  }
}

export async function pruneExpired(dir) {
  let removed = 0;
  let names;
  try {
    names = await readdir(dir);
  } catch (error) {
    if (error && error.code === "ENOENT") return 0;
    logCacheError("prune-readdir", error);
    return 0;
  }
  const now = Date.now();
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const file = join(dir, name);
    try {
      const text = await readFile(file, "utf8");
      const entry = JSON.parse(text);
      if (!entry || typeof entry.expiresAt !== "number" || entry.expiresAt <= now) {
        await safeUnlink(file);
        removed += 1;
      }
    } catch (error) {
      if (error && error.code === "ENOENT") continue;
      logCacheError("prune-entry", error);
    }
  }
  return removed;
}

function entryPath(dir, key) {
  if (!dir || typeof key !== "string") return null;
  const safe = key.replace(/[^a-f0-9]/gi, "").slice(0, 64);
  if (!safe) return null;
  return join(dir, `${safe}.json`);
}

async function safeUnlink(file) {
  try {
    await rm(file, { force: true });
  } catch (error) {
    logCacheError("unlink", error);
  }
}

function logCacheError(op, error) {
  const message = error && error.message ? error.message : String(error);
  process.stderr.write(`cache ${op} error: ${message}\n`);
}
