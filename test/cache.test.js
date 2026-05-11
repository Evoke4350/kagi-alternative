import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCached, makeCacheKey, pruneExpired, setCached } from "../src/search/cache.js";

function freshDir() {
  return join(tmpdir(), `websearch-cache-${randomUUID()}`);
}

async function cleanup(dir) {
  await rm(dir, { recursive: true, force: true });
}

test("set then get returns the value", async () => {
  const dir = freshDir();
  try {
    const key = makeCacheKey(["hello", "default", 20]);
    await setCached(dir, key, { results: [1, 2, 3] }, 60_000);
    const got = await getCached(dir, key);
    assert.deepEqual(got, { results: [1, 2, 3] });
  } finally {
    await cleanup(dir);
  }
});

test("get of unset key returns null", async () => {
  const dir = freshDir();
  try {
    const key = makeCacheKey(["nothing"]);
    const got = await getCached(dir, key);
    assert.equal(got, null);
  } finally {
    await cleanup(dir);
  }
});

test("get of expired entry returns null and removes the file", async () => {
  const dir = freshDir();
  try {
    const key = makeCacheKey(["expiring"]);
    await setCached(dir, key, "stale", 1);
    // Force the entry to be already expired by overwriting with a past timestamp.
    const file = join(dir, `${key}.json`);
    await writeFile(file, JSON.stringify({ expiresAt: Date.now() - 1000, value: "stale" }), "utf8");
    const got = await getCached(dir, key);
    assert.equal(got, null);
    const names = await readdir(dir);
    assert.ok(!names.includes(`${key}.json`), "expired file should be removed");
  } finally {
    await cleanup(dir);
  }
});

test("makeCacheKey is deterministic and differs on different inputs", () => {
  const a = makeCacheKey(["query", "default", 20]);
  const b = makeCacheKey(["query", "default", 20]);
  const c = makeCacheKey(["query", "default", 21]);
  const d = makeCacheKey(["query", "other", 20]);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.match(a, /^[a-f0-9]{64}$/);
});

test("pruneExpired removes only expired entries", async () => {
  const dir = freshDir();
  try {
    const liveKey = makeCacheKey(["live"]);
    const deadKey = makeCacheKey(["dead"]);
    await setCached(dir, liveKey, "live-value", 60_000);
    await setCached(dir, deadKey, "dead-value", 60_000);
    // Backdate the dead entry directly.
    await writeFile(
      join(dir, `${deadKey}.json`),
      JSON.stringify({ expiresAt: Date.now() - 1000, value: "dead-value" }),
      "utf8",
    );
    const removed = await pruneExpired(dir);
    assert.equal(removed, 1);
    const names = await readdir(dir);
    assert.ok(names.includes(`${liveKey}.json`));
    assert.ok(!names.includes(`${deadKey}.json`));
  } finally {
    await cleanup(dir);
  }
});

test("pruneExpired on missing dir returns 0 without throwing", async () => {
  const dir = freshDir();
  const removed = await pruneExpired(dir);
  assert.equal(removed, 0);
});
