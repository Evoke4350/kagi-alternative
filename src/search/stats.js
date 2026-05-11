// In-memory ring-buffer stats per adapter. No persistence, no dependencies.
// Used by aggregate.js to record outcomes and by render.js to surface a stats page.
// On restart all history is lost — fine for a prototype; persistence can come later.

export const RING_SIZE = 200;

const buffers = new Map();

export function record(name, ok, ms) {
  if (!name) return;
  let buf = buffers.get(name);
  if (!buf) {
    buf = [];
    buffers.set(name, buf);
  }
  buf.push({ ok: !!ok, ms: Number(ms) || 0, t: Date.now() });
  if (buf.length > RING_SIZE) buf.shift();
}

export function snapshot() {
  // Adapters with zero runs are omitted entirely. Callers (e.g. statsPage)
  // can cross-reference listAdapters() to surface "no data yet" entries.
  const out = [];
  for (const [name, buf] of buffers) {
    if (buf.length === 0) continue;
    // Percentiles are computed across ALL samples (success and failure),
    // because latency on errors is still meaningful signal — a slow timeout
    // is just as much a performance problem as a slow success.
    const sorted = buf.map((s) => s.ms).sort((a, b) => a - b);
    const successes = buf.reduce((n, s) => n + (s.ok ? 1 : 0), 0);
    const sum = sorted.reduce((a, b) => a + b, 0);
    out.push({
      name,
      runs: buf.length,
      successes,
      errorRate: 1 - successes / buf.length,
      p50ms: percentile(sorted, 0.5),
      p95ms: percentile(sorted, 0.95),
      meanMs: Math.round(sum / buf.length),
      lastRun: buf[buf.length - 1].t,
    });
  }
  return out;
}

export function reset() {
  buffers.clear();
}

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  // Nearest-rank: index = ceil(p * n) - 1, clamped.
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx];
}
