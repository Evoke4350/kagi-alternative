import { escapeHtml, highlight, tokenize, truncate } from "../text.js";
import { listAdapters } from "../adapters/index.js";
import { RING_SIZE } from "../search/stats.js";

export function layout({ title, body, query = "", description = "" }) {
  const desc = description || "Open-source Kagi alternative. Self-hosted privacy-respecting metasearch engine for developers. Zero dependencies, hackable, MIT-licensed.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="description" content="${escapeHtml(desc)}">
<meta name="robots" content="index,follow">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="websearch">
<meta name="twitter:card" content="summary">
<title>${escapeHtml(title)}</title>
<style>${css()}</style>
</head>
<body>
<header>
  <a class="brand" href="/">websearch</a>
  <form method="GET" action="/search" class="search">
    <input name="q" type="search" value="${escapeHtml(query)}" placeholder="search the open web" autofocus>
    <button type="submit">Search</button>
  </form>
  <nav>
    <a href="/about">About</a>
    <a href="/privacy">Privacy</a>
    <a href="/sources">Sources</a>
    <a href="/stats">Stats</a>
  </nav>
</header>
<main>${body}</main>
<footer><a href="https://github.com/Evoke4350/kagi-alternative">open source · MIT</a></footer>
</body>
</html>`;
}

export function layoutStreaming({ title, query = "", body, description = "" }) {
  const desc = description || "Open-source Kagi alternative. Self-hosted privacy-respecting metasearch engine for developers. Zero dependencies, hackable, MIT-licensed.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="description" content="${escapeHtml(desc)}">
<meta name="robots" content="index,follow">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:type" content="website">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
<header>
  <a class="brand" href="/">websearch</a>
  <form method="GET" action="/search" class="search" id="search-form">
    <div class="search-input-wrap">
      <input name="q" id="q" type="search" value="${escapeHtml(query)}" placeholder="search the open web" autocomplete="off" autofocus>
      <div class="chips" id="chips" aria-live="polite"></div>
    </div>
    <button type="submit">Search</button>
    <button type="button" class="icon-btn" id="share-btn" title="Copy link to this search (s)" aria-label="Share">
      <span aria-hidden="true">⤴</span>
    </button>
  </form>
  <nav>
    <a href="/about">About</a>
    <a href="/privacy">Privacy</a>
    <a href="/sources">Sources</a>
    <a href="/stats">Stats</a>
  </nav>
</header>
<main>${body}</main>
<footer><a href="https://github.com/Evoke4350/kagi-alternative">open source · MIT</a></footer>
<script type="module" src="/static/app.js"></script>
</body>
</html>`;
}

export function homePage() {
  const adapters = listAdapters();
  const adapterList = adapters
    .map((a) => `<li><b>${escapeHtml(a.name)}</b> · weight ${a.weight} · ${a.enabled ? "enabled" : a.requiresKey ? "needs API key" : "disabled"}</li>`)
    .join("");
  const body = `
    <section class="hero">
      <h1>Open-source metasearch.</h1>
      <p>Combine multiple public search APIs and free corpora into one re-ranked result list. No tracking, no ads, no query logs.</p>
    </section>
    <section>
      <h2>Active sources</h2>
      <ul class="adapters">${adapterList}</ul>
    </section>
    <section>
      <h2>How it works</h2>
      <ol>
        <li>Query is fanned out to every active adapter in parallel.</li>
        <li>Results are deduplicated by canonical URL, then fused with reciprocal rank + lexical scoring.</li>
        <li>Per-user lens applies block / boost / downrank rules.</li>
        <li>Top results returned. Nothing is logged.</li>
      </ol>
    </section>`;
  return layout({ title: "websearch", body });
}

export function searchPage(query, initialData = {}) {
  if (!query) {
    return layout({ title: "websearch", body: "<p>Type something to search.</p>", query });
  }
  const initialLens = escapeHtml(initialData.lens || "default");
  const body = `
    <noscript>
      <p>Streaming results require JavaScript. Use <a href="/search-static?q=${encodeURIComponent(query)}">/search-static</a> for a server-rendered page, or <a href="/api/search?q=${encodeURIComponent(query)}">/api/search</a> for JSON.</p>
    </noscript>
    <div id="root"
         data-query="${escapeHtml(query)}"
         data-lens="${initialLens}"
         data-limit="20">
      <div class="adapter-waterfall" id="adapter-waterfall">
        <div class="adapter-pills" id="adapter-pills"></div>
        <div class="elapsed-row">
          <span class="elapsed" id="elapsed">starting…</span>
          <span class="cached-pill" id="cached-pill" hidden>cached</span>
        </div>
      </div>
      <p class="stats" id="stats" hidden></p>
      <div class="results" id="results"></div>
    </div>
    <aside class="preview-pane" id="preview-pane" hidden aria-hidden="true"></aside>
    <div class="palette-backdrop" id="palette-backdrop" hidden></div>
    <div class="palette" id="palette" hidden role="dialog" aria-label="Command palette"></div>
    <div class="help-overlay" id="help-overlay" hidden role="dialog" aria-label="Keyboard help"></div>
    <div class="toasts" id="toasts" aria-live="polite"></div>`;
  return layoutStreaming({ title: `${query} — websearch`, query, body });
}

export function searchPageStatic(query, { results, adapters, totalCandidates, lens }) {
  const tokens = tokenize(query);
  if (!query) return layout({ title: "websearch", body: "<p>Type something to search.</p>", query });
  const items = results
    .map((r) => {
      const host = escapeHtml(r.host || "");
      const titleHtml = highlight(r.title || "(no title)", tokens);
      const snippetHtml = highlight(truncate(r.snippet || "", 280), tokens);
      const sourceTags = r.sources.map((s) => `<span class="tag tag-${escapeHtml(s)}">${escapeHtml(s)}</span>`).join("");
      const score = r.score.toFixed(1);
      const url = escapeHtml(r.url);
      return `<article class="result">
        <a class="title" href="${url}" rel="noopener noreferrer nofollow">${titleHtml}</a>
        <div class="meta"><span class="host">${host}</span> ${sourceTags} <span class="score" title="score">${score}</span></div>
        <p class="snippet">${snippetHtml}</p>
      </article>`;
    })
    .join("");

  const stats = `<p class="stats">${results.length} results · ${totalCandidates} candidates · lens <code>${escapeHtml(lens)}</code></p>`;
  const adapterStatus = adapters
    .map((a) => `<span class="adapter ${a.ok ? "ok" : "fail"}">${escapeHtml(a.name)} · ${a.count}${a.error ? ` (${escapeHtml(a.error)})` : ""}</span>`)
    .join(" ");
  const body = `
    ${stats}
    <div class="sources">${adapterStatus}</div>
    <div class="results">${items || "<p>No results.</p>"}</div>`;
  return layout({ title: `${query} — websearch`, body, query });
}

export function aboutPage() {
  const body = `
    <h1>About websearch</h1>
    <p>An open-source, privacy-respecting metasearch engine. Inspired by Kagi and Searxng but smaller, hackable, and zero-dependency.</p>
    <p>This is a prototype. The roadmap covers crawling Common Crawl subsets into a local Tantivy/Lucene index, adding semantic re-rank with embeddings, and persistent caching.</p>
    <p>Source: <a href="https://github.com/Evoke4350/kagi-alternative">github.com/Evoke4350/kagi-alternative</a></p>`;
  return layout({ title: "About — websearch", body });
}

export function privacyPage() {
  const body = `
    <h1>Privacy</h1>
    <ul>
      <li>No accounts, no cookies, no client-side scripts.</li>
      <li>No query logging. Queries are not written to disk.</li>
      <li>Outbound links carry <code>rel="noopener noreferrer nofollow"</code> and the page sends <code>Referrer-Policy: no-referrer</code>.</li>
      <li>Upstream APIs receive the raw query — that is the irreducible cost of metasearch. Choose your adapters accordingly.</li>
      <li>Lens files live on disk (unencrypted) at the path in <code>WEBSEARCH_LENS</code>.</li>
    </ul>`;
  return layout({ title: "Privacy — websearch", body });
}

export function sourcesPage() {
  const adapters = listAdapters();
  const rows = adapters
    .map((a) => `<tr><td>${escapeHtml(a.name)}</td><td>${a.weight}</td><td>${a.enabled ? "yes" : "no"}</td><td>${a.requiresKey ? "yes" : "no"}</td></tr>`)
    .join("");
  const body = `
    <h1>Sources</h1>
    <table><thead><tr><th>Name</th><th>Weight</th><th>Enabled</th><th>Requires key</th></tr></thead><tbody>${rows}</tbody></table>
    <p>To enable a paid adapter set its API key in <code>.env</code> and restart.</p>`;
  return layout({ title: "Sources — websearch", body });
}

export function statsPage(snapshot, adapters) {
  const now = Date.now();
  const seen = new Set();
  const rows = snapshot
    .map((s) => {
      seen.add(s.name);
      const errPct = (s.errorRate * 100).toFixed(1);
      return `<tr><td>${escapeHtml(s.name)}</td><td>${s.runs}</td><td>${errPct}%</td><td>${s.p50ms}</td><td>${s.p95ms}</td><td>${s.meanMs}</td><td>${escapeHtml(relativeTime(now - s.lastRun))}</td></tr>`;
    })
    .join("");
  const missing = (adapters || [])
    .filter((a) => !seen.has(a.name))
    .map((a) => `<tr><td>${escapeHtml(a.name)}</td><td colspan="6">no data yet</td></tr>`)
    .join("");
  const body = `
    <h1>Stats</h1>
    <table><thead><tr><th>Name</th><th>Runs</th><th>Error rate</th><th>p50 ms</th><th>p95 ms</th><th>Mean ms</th><th>Last run</th></tr></thead><tbody>${rows}${missing}</tbody></table>
    <p>In-memory, last ${RING_SIZE} samples per adapter. Resets on restart.</p>`;
  return layout({ title: "Stats — websearch", body });
}

function relativeTime(deltaMs) {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return "just now";
  const s = Math.floor(deltaMs / 1000);
  if (s < 1) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function notFoundPage() {
  return layout({ title: "Not found — websearch", body: "<h1>404</h1><p>Not found.</p>" });
}

function css() {
  return `
    :root { color-scheme: light dark; --fg:#111; --muted:#666; --bg:#fafafa; --card:#fff; --accent:#2657c4; --tag:#eef; }
    @media (prefers-color-scheme: dark) {
      :root { --fg:#eee; --muted:#9aa; --bg:#0e0f12; --card:#16181d; --accent:#7aa8ff; --tag:#1d2440; }
    }
    * { box-sizing: border-box; }
    body { margin:0; font:16px/1.5 system-ui, sans-serif; color:var(--fg); background:var(--bg); }
    header { display:flex; gap:1rem; align-items:center; padding:.8rem 1rem; border-bottom:1px solid #8884; flex-wrap:wrap; }
    .brand { font-weight:700; text-decoration:none; color:var(--fg); }
    .search { display:flex; flex:1; min-width:260px; gap:.4rem; }
    .search input { flex:1; padding:.5rem .7rem; border:1px solid #8886; border-radius:6px; background:var(--card); color:var(--fg); }
    .search button { padding:.5rem .9rem; border:0; border-radius:6px; background:var(--accent); color:#fff; cursor:pointer; }
    nav a { margin-left:.8rem; color:var(--muted); text-decoration:none; font-size:.9rem; }
    main { max-width:780px; margin:1rem auto; padding:0 1rem; }
    footer { text-align:center; padding:1.5rem; color:var(--muted); font-size:.85rem; }
    footer a { color:var(--muted); }
    .hero h1 { margin:.2rem 0; font-size:1.8rem; }
    .hero p { color:var(--muted); }
    .adapters { padding-left:1.2rem; }
    .stats { color:var(--muted); font-size:.9rem; }
    .sources { display:flex; gap:.5rem; flex-wrap:wrap; margin-bottom:1rem; font-size:.8rem; }
    .adapter { padding:.2rem .5rem; border-radius:4px; background:var(--tag); }
    .adapter.fail { background:#c247; }
    .result { background:var(--card); padding:.8rem 1rem; margin-bottom:.7rem; border-radius:8px; border:1px solid #8882; }
    .result .title { font-size:1.1rem; color:var(--accent); text-decoration:none; }
    .result .title:hover { text-decoration:underline; }
    .result .meta { font-size:.8rem; color:var(--muted); margin:.2rem 0 .4rem; display:flex; gap:.4rem; align-items:center; flex-wrap:wrap; }
    .tag { padding:.05rem .4rem; border-radius:3px; background:var(--tag); font-size:.7rem; }
    .score { margin-left:auto; opacity:.6; }
    .snippet { margin:0; font-size:.95rem; }
    mark { background:#ff05; color:inherit; padding:0 .1rem; border-radius:2px; }
    code { background:var(--tag); padding:.05rem .3rem; border-radius:3px; }
    table { width:100%; border-collapse:collapse; }
    th, td { border-bottom:1px solid #8884; padding:.4rem; text-align:left; }
  `;
}
