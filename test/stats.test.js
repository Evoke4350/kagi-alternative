import test from "node:test";
import assert from "node:assert/strict";
import { record, snapshot, reset, RING_SIZE } from "../src/search/stats.js";

test("record + snapshot round-trips for a single adapter", () => {
  reset();
  record("brave", true, 100);
  record("brave", true, 200);
  record("brave", false, 300);
  const snap = snapshot();
  assert.equal(snap.length, 1);
  const s = snap[0];
  assert.equal(s.name, "brave");
  assert.equal(s.runs, 3);
  assert.equal(s.successes, 2);
  assert.ok(typeof s.lastRun === "number" && s.lastRun > 0);
});

test("ring buffer caps at RING_SIZE", () => {
  reset();
  for (let i = 0; i < RING_SIZE + 50; i++) record("brave", true, i);
  const s = snapshot()[0];
  assert.equal(s.runs, RING_SIZE);
});

test("p50 and p95 computed on [100,200,300,400,500]", () => {
  reset();
  for (const ms of [100, 200, 300, 400, 500]) record("brave", true, ms);
  const s = snapshot()[0];
  assert.equal(s.p50ms, 300);
  assert.equal(s.p95ms, 500);
  assert.equal(s.meanMs, 300);
});

test("errorRate is computed correctly", () => {
  reset();
  for (let i = 0; i < 8; i++) record("brave", true, 10);
  for (let i = 0; i < 2; i++) record("brave", false, 10);
  const s = snapshot()[0];
  assert.equal(s.runs, 10);
  assert.equal(s.successes, 8);
  assert.ok(Math.abs(s.errorRate - 0.2) < 1e-9);
});

test("reset clears state", () => {
  reset();
  record("brave", true, 100);
  assert.equal(snapshot().length, 1);
  reset();
  assert.equal(snapshot().length, 0);
});

test("adapters with zero runs are omitted from snapshot", () => {
  reset();
  record("brave", true, 100);
  const names = snapshot().map((s) => s.name);
  assert.deepEqual(names, ["brave"]);
});

test("multiple adapters tracked independently", () => {
  reset();
  record("brave", true, 100);
  record("wikipedia", false, 500);
  record("wikipedia", true, 400);
  const snap = snapshot();
  const brave = snap.find((s) => s.name === "brave");
  const wiki = snap.find((s) => s.name === "wikipedia");
  assert.equal(brave.runs, 1);
  assert.equal(brave.successes, 1);
  assert.equal(wiki.runs, 2);
  assert.equal(wiki.successes, 1);
  assert.ok(Math.abs(wiki.errorRate - 0.5) < 1e-9);
});
