// websearch streaming client — vanilla ES module, zero deps.
// Targets modern evergreen browsers (Chrome 120+, Firefox 120+, Safari 17+).

// === constants & DOM lookups ===

const KEY_HELP = [
  ["j / k", "next / previous result"],
  ["o", "open focused result in new tab"],
  ["Enter", "open focused result"],
  ["c", "copy focused URL"],
  ["e", "toggle explain rank"],
  ["Space", "toggle preview pane"],
  ["1–9", "jump to result"],
  ["/", "focus search input"],
  ["?", "toggle this help"],
  ["Esc", "close any overlay"],
  ["Cmd+K / Ctrl+K", "command palette"],
];

const root = document.getElementById("root");

// === state ===

const state = {
  query: root ? root.dataset.query || "" : "",
  limit: root ? Number(root.dataset.limit || 20) : 20,
  activeAdapters: [],
  adapterStatus: new Map(), // name -> {status, ms, count, ok, error}
  maxMs: 0,
  results: [],
  resultByUrl: new Map(),
  focusIndex: -1,
  explainOpen: new Set(),
  previewOpenFor: null,
  toastTimers: new Set(),
  startedAt: 0,
  elapsedTimer: null,
  done: false,
  cached: false,
};

// === utilities ===

function $(id) { return document.getElementById(id); }

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "className") node.className = v;
    else if (k === "dataset") for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "html") node.innerHTML = v;
    else if (k === "hidden") node.hidden = !!v;
    else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokensFromQuery(q) {
  // mirror server tokenize but lighter; strip operators first
  const cleaned = q
    .replace(/!\S+/g, " ")
    .replace(/-?site:\S+/g, " ")
    .replace(/lang:\S+/g, " ")
    .replace(/before:\S+/g, " ")
    .replace(/after:\S+/g, " ")
    .replace(/type:\S+/g, " ")
    .replace(/-[\w-]+/g, " ");
  return cleaned
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function highlight(text, tokens) {
  if (!tokens.length) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const pattern = new RegExp(`(${tokens.map(escapeRegex).join("|")})`, "gi");
  return escaped.replace(pattern, "<mark>$1</mark>");
}

function truncate(value, max) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

function relativeTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// === toasts ===

function toast(text) {
  const host = $("toasts");
  if (!host) return;
  const node = el("div", { className: "toast" }, text);
  host.appendChild(node);
  const t = setTimeout(() => {
    node.remove();
    state.toastTimers.delete(t);
  }, 2000);
  state.toastTimers.add(t);
}

// === operator chip parsing ===

const OP_REGEXES = [
  { kind: "bang",         re: /(?:^|\s)(!([a-z0-9]+))(?=\s|$)/gi,        label: (m) => `!${m[2]}` },
  { kind: "site-exclude", re: /(?:^|\s)(-site:([^\s]+))(?=\s|$)/gi,      label: (m) => `-site:${m[2]}` },
  { kind: "site-include", re: /(?:^|\s)(site:([^\s]+))(?=\s|$)/gi,       label: (m) => `site:${m[2]}` },
  { kind: "lang",         re: /(?:^|\s)(lang:([^\s]+))(?=\s|$)/gi,       label: (m) => `lang:${m[2]}` },
  { kind: "before",       re: /(?:^|\s)(before:([^\s]+))(?=\s|$)/gi,     label: (m) => `before:${m[2]}` },
  { kind: "after",        re: /(?:^|\s)(after:([^\s]+))(?=\s|$)/gi,      label: (m) => `after:${m[2]}` },
  { kind: "type",         re: /(?:^|\s)(type:([^\s]+))(?=\s|$)/gi,       label: (m) => `type:${m[2]}` },
  { kind: "minus",        re: /(?:^|\s)(-([a-z][\w-]+))(?=\s|$)/gi,      label: (m) => `-${m[2]}` },
];

function parseChips(query) {
  const chips = [];
  for (const { kind, re, label } of OP_REGEXES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(query))) {
      if (kind === "minus" && /^-?site:/.test(m[1])) continue;
      chips.push({ kind, raw: m[1], label: label(m) });
    }
  }
  return chips;
}

function renderChips() {
  const host = $("chips");
  const input = $("q");
  if (!host || !input) return;
  host.innerHTML = "";
  const chips = parseChips(input.value);
  for (const c of chips) {
    host.appendChild(el(
      "span",
      { className: "chip", dataset: { kind: c.kind } },
      c.label,
      el("button", { type: "button", "aria-label": `remove ${c.label}`, onclick: () => removeChip(c.raw) }, "×"),
    ));
  }
}

function removeChip(raw) {
  const input = $("q");
  if (!input) return;
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, "g");
  input.value = input.value.replace(re, "").replace(/\s{2,}/g, " ").trim();
  renderChips();
  input.focus();
}

// === adapter pills + waterfall ===

function initAdapterPills(names) {
  const host = $("adapter-pills");
  if (!host) return;
  host.innerHTML = "";
  for (const name of names) {
    state.adapterStatus.set(name, { status: "pending", ms: 0, count: 0, ok: false, error: null });
    const node = el(
      "div",
      { className: "adapter-pill", dataset: { status: "pending", name } },
      el("span", { className: "name" }, name),
      el("div", { className: "bar", style: "width: 0%;" }),
      el("span", { className: "ms" }, "…"),
    );
    host.appendChild(node);
  }
}

function updateAdapterPill(evt) {
  const cur = state.adapterStatus.get(evt.name) || {};
  cur.status = evt.ok ? "ok" : "fail";
  cur.ms = evt.ms || 0;
  cur.count = evt.count || 0;
  cur.ok = evt.ok;
  cur.error = evt.error;
  state.adapterStatus.set(evt.name, cur);
  state.maxMs = Math.max(state.maxMs, cur.ms);
  redrawAdapterPills();
}

function redrawAdapterPills() {
  const host = $("adapter-pills");
  if (!host) return;
  for (const node of host.children) {
    const name = node.dataset.name;
    const s = state.adapterStatus.get(name);
    if (!s) continue;
    node.dataset.status = s.status;
    const bar = node.querySelector(".bar");
    const ms = node.querySelector(".ms");
    const widthPct = state.maxMs > 0 ? Math.max(2, Math.round((s.ms / state.maxMs) * 100)) : 0;
    bar.style.width = `${widthPct}%`;
    if (s.status === "pending") ms.textContent = "…";
    else if (s.ok) ms.textContent = `${s.ms}ms · ${s.count}`;
    else ms.textContent = s.error ? `err · ${s.error}` : "err";
  }
}

function updateElapsed() {
  const node = $("elapsed");
  if (!node) return;
  if (state.done) return;
  const ms = Date.now() - state.startedAt;
  node.textContent = `${ms}ms elapsed`;
}

// === result rendering ===

function rebuildResults(items) {
  const tokens = tokensFromQuery(state.query);
  const host = $("results");
  if (!host) return;
  const prevKeys = new Set(state.resultByUrl.keys());
  const nextKeys = new Set(items.map((r) => r.url));

  // remove rows no longer present
  for (const key of prevKeys) {
    if (!nextKeys.has(key)) {
      const node = host.querySelector(`[data-key="${cssEscape(key)}"]`);
      if (node) {
        node.classList.add("leaving");
        setTimeout(() => node.remove(), 200);
      }
      state.resultByUrl.delete(key);
    }
  }

  // re-order / update / insert
  state.results = items.slice();
  for (let i = 0; i < items.length; i++) {
    const r = items[i];
    let node = host.querySelector(`[data-key="${cssEscape(r.url)}"]`);
    const isNew = !node;
    if (isNew) {
      node = renderResultRow(r, i, tokens);
      node.classList.add("entering");
    } else {
      updateResultRow(node, r, i, tokens);
    }
    if (host.children[i] !== node) host.insertBefore(node, host.children[i] || null);
    state.resultByUrl.set(r.url, r);
  }

  // refocus
  if (state.focusIndex >= items.length) state.focusIndex = items.length - 1;
  applyFocus();
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return String(value).replace(/(["\\])/g, "\\$1");
}

function renderResultRow(r, index, tokens) {
  const node = el("article", { className: "result", dataset: { key: r.url } });
  fillResultRow(node, r, index, tokens);
  return node;
}

function updateResultRow(node, r, index, tokens) {
  // preserve "focused" class state by storing previous classes minus mutables
  const wasFocused = node.classList.contains("focused");
  node.innerHTML = "";
  fillResultRow(node, r, index, tokens);
  if (wasFocused) node.classList.add("focused");
}

function fillResultRow(node, r, index, tokens) {
  const trail = getTrailEntry(r.url);
  const visitedTag = trail
    ? el("span", { className: "tag visited", title: `last visited ${new Date(trail.ts).toLocaleString()}` }, `previously visited ${relativeTime(Date.now() - trail.ts)}`)
    : null;
  if (trail) node.classList.add("visited");

  const titleLink = el("a", {
    className: "title",
    href: r.url,
    target: "_blank",
    rel: "noopener noreferrer nofollow",
    html: highlight(r.title || "(no title)", tokens),
  });

  const meta = el("div", { className: "meta" },
    el("span", { className: "rank" }, `#${index + 1}`),
    el("span", { className: "host" }, r.host || ""),
    ...sourceTags(r.sources),
    visitedTag,
    el("span", { className: "score", title: "final score" }, (r.score || 0).toFixed(1)),
  );

  const snippet = el("p", { className: "snippet", html: highlight(truncate(r.snippet || "", 280), tokens) });
  const contrib = renderContribBar(r);

  node.appendChild(titleLink);
  node.appendChild(meta);
  if (contrib) node.appendChild(contrib);
  node.appendChild(snippet);

  if (state.explainOpen.has(r.url)) {
    node.appendChild(renderExplainPanel(r, index));
  }

  // track click → trail
  titleLink.addEventListener("click", () => recordTrailClick(r));
}

function sourceTags(sources) {
  return (sources || []).map((s) =>
    el("span", { className: `tag tag-${s}` }, s)
  );
}

function renderContribBar(r) {
  const breakdown = (r.explain && r.explain.byAdapter) || [];
  const totals = breakdown.map((b) => Math.max(0, Number(b.total) || 0));
  const sum = totals.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  const bar = el("div", { className: "contrib-bar", title: "source contribution to final score" });
  breakdown.forEach((b, i) => {
    const pct = (totals[i] / sum) * 100;
    if (pct <= 0) return;
    const seg = el("span", {
      style: `width:${pct.toFixed(2)}%; background: var(--c-${b.name}, var(--muted));`,
      title: `${b.name}: +${(b.total || 0).toFixed(2)}`,
    });
    bar.appendChild(seg);
  });
  return bar;
}

function renderExplainPanel(r, index) {
  const ex = r.explain || { byAdapter: [], finalScore: r.score };
  const headerRow = el("tr", {}, ...["source","pos","weight","rrf","lex","total"].map((h) => el("th", {}, h)));
  const rows = (ex.byAdapter || []).map((b) => el("tr", {},
    el("td", {}, b.name),
    el("td", {}, `pos #${b.position}`),
    el("td", {}, `weight ${(b.weight ?? 1).toFixed(2)}`),
    el("td", {}, `rrf ${(b.rrf ?? 0).toFixed(3)}`),
    el("td", {}, `lex ${(b.lexical ?? 0).toFixed(2)}`),
    el("td", { className: "right" }, `+${(b.total ?? 0).toFixed(2)}`),
  ));
  const ms = ex.multiSourceDiversity ?? 1;
  const lf = ex.lensFactor ?? r.lensFactor ?? 1;
  const lr = ex.lensReason ? ` (${ex.lensReason})` : "";
  return el("section", { className: "explain" },
    el("h4", {}, `Why this result ranked #${index + 1}`),
    el("table", {}, el("thead", {}, headerRow), el("tbody", {}, ...rows)),
    el("div", {}, `multi-source diversity × ${ms.toFixed(2)}`),
    el("div", {}, `lens factor × ${lf.toFixed(2)}${lr}`),
    el("div", { className: "final" }, `final score: ${(ex.finalScore ?? r.score ?? 0).toFixed(2)}`),
  );
}

// === keyboard focus ===

function focusResult(index) {
  if (!state.results.length) return;
  const clamped = Math.max(0, Math.min(state.results.length - 1, index));
  state.focusIndex = clamped;
  applyFocus();
  const host = $("results");
  const node = host && host.children[clamped];
  if (node && node.scrollIntoView) node.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function applyFocus() {
  const host = $("results");
  if (!host) return;
  for (let i = 0; i < host.children.length; i++) {
    host.children[i].classList.toggle("focused", i === state.focusIndex);
  }
}

function focusedResult() {
  return state.focusIndex >= 0 ? state.results[state.focusIndex] : null;
}

// === explain toggle ===

function toggleExplain() {
  const r = focusedResult();
  if (!r) return;
  if (state.explainOpen.has(r.url)) state.explainOpen.delete(r.url);
  else state.explainOpen.add(r.url);
  rebuildResults(state.results);
}

// === preview pane ===

async function openPreview(url) {
  const pane = $("preview-pane");
  if (!pane) return;
  pane.hidden = false;
  pane.setAttribute("aria-hidden", "false");
  state.previewOpenFor = url;
  pane.innerHTML = "";
  pane.appendChild(el("button", { className: "close", "aria-label": "close preview", onclick: closePreview }, "×"));
  pane.appendChild(el("div", { className: "spinner" }, "loading preview…"));
  try {
    const res = await fetch(`/api/preview?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`preview failed: ${res.status}`);
    const data = await res.json();
    renderPreview(pane, data, url);
  } catch (err) {
    pane.innerHTML = "";
    pane.appendChild(el("button", { className: "close", "aria-label": "close preview", onclick: closePreview }, "×"));
    pane.appendChild(el("p", {}, `preview unavailable: ${err.message}`));
    pane.appendChild(el("a", { href: url, target: "_blank", rel: "noopener noreferrer nofollow" }, "open original"));
  }
}

function renderPreview(pane, data, originalUrl) {
  pane.innerHTML = "";
  pane.appendChild(el("button", { className: "close", "aria-label": "close preview", onclick: closePreview }, "×"));
  if (data.imageUrl) {
    const img = el("img", { className: "hero", src: data.imageUrl, alt: "", loading: "lazy" });
    pane.appendChild(img);
  }
  pane.appendChild(el("h2", {}, data.title || originalUrl));
  pane.appendChild(el("div", { className: "host" }, data.host || ""));
  if (data.publishedAt) {
    const t = new Date(data.publishedAt).getTime();
    if (Number.isFinite(t)) pane.appendChild(el("div", { className: "pub" }, relativeTime(Date.now() - t)));
  }
  if (data.description) pane.appendChild(el("p", { className: "desc" }, data.description));
  if (data.text) pane.appendChild(el("p", { className: "text" }, truncate(data.text, 1200)));
  pane.appendChild(el("div", { className: "actions" },
    el("a", { href: originalUrl, target: "_blank", rel: "noopener noreferrer nofollow" }, "open original →"),
  ));
}

function closePreview() {
  const pane = $("preview-pane");
  if (!pane) return;
  pane.hidden = true;
  pane.setAttribute("aria-hidden", "true");
  state.previewOpenFor = null;
}

function togglePreview() {
  const r = focusedResult();
  if (!r) return;
  if (state.previewOpenFor === r.url) closePreview();
  else openPreview(r.url);
}

// === command palette ===

function paletteItems() {
  const go = (path) => () => (window.location.href = path);
  return [
    ...getRecentQueries().map((q) => ({ label: `Recent: ${q}`, action: () => goToQuery(q) })),
    { label: "Switch to lens: default", action: () => setLens("default") },
    { label: "Toggle preview pane", action: togglePreview },
    { label: "Toggle explain rank", action: toggleExplain },
    { label: "Show stats", action: go("/stats") },
    { label: "Show sources", action: go("/sources") },
    { label: "Show privacy", action: go("/privacy") },
    { label: "Show keyboard help", action: toggleHelp },
    { label: "Clear local trail", action: clearTrail },
  ];
}

let paletteState = { filter: "", selected: 0, items: [] };

function openPalette() {
  const pal = $("palette");
  const back = $("palette-backdrop");
  if (!pal || !back) return;
  paletteState = { filter: "", selected: 0, items: paletteItems() };
  pal.innerHTML = "";
  const input = el("input", { type: "text", placeholder: "command or recent query…", "aria-label": "command palette filter" });
  const list = el("ul", { id: "palette-list" });
  pal.appendChild(input);
  pal.appendChild(list);
  back.hidden = false;
  pal.hidden = false;
  input.focus();

  input.addEventListener("input", () => {
    paletteState.filter = input.value;
    paletteState.selected = 0;
    renderPaletteList(list);
  });
  input.addEventListener("keydown", (e) => paletteKey(e, list));
  renderPaletteList(list);
}

function renderPaletteList(list) {
  const f = paletteState.filter.toLowerCase();
  const filtered = paletteState.items.filter((it) => it.label.toLowerCase().includes(f));
  paletteState.filtered = filtered;
  list.innerHTML = "";
  filtered.forEach((it, i) => {
    const li = el("li", { className: i === paletteState.selected ? "selected" : "", onclick: () => { closePalette(); it.action(); } }, it.label);
    list.appendChild(li);
  });
  if (paletteState.selected >= filtered.length) paletteState.selected = Math.max(0, filtered.length - 1);
}

function paletteKey(e, list) {
  const items = paletteState.filtered || [];
  if (e.key === "ArrowDown") {
    e.preventDefault();
    paletteState.selected = Math.min(items.length - 1, paletteState.selected + 1);
    renderPaletteList(list);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    paletteState.selected = Math.max(0, paletteState.selected - 1);
    renderPaletteList(list);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const it = items[paletteState.selected];
    if (it) { closePalette(); it.action(); }
  } else if (e.key === "Escape") {
    e.preventDefault();
    closePalette();
  }
}

function closePalette() {
  const pal = $("palette");
  const back = $("palette-backdrop");
  if (pal) pal.hidden = true;
  if (back) back.hidden = true;
}

// === help overlay ===

let helpOpen = false;
function toggleHelp() {
  const overlay = $("help-overlay");
  if (!overlay) return;
  helpOpen = !helpOpen;
  overlay.hidden = !helpOpen;
  if (helpOpen) {
    overlay.innerHTML = "";
    const dl = el("dl");
    for (const [k, d] of KEY_HELP) {
      dl.appendChild(el("dt", {}, k));
      dl.appendChild(el("dd", {}, d));
    }
    overlay.appendChild(el("div", { className: "card" },
      el("h2", {}, "Keyboard shortcuts"),
      dl,
      el("div", { className: "close-hint" }, "press ? or Esc to close"),
    ));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) toggleHelp(); }, { once: true });
  }
}

// === keyboard handler ===

function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function onKeyDown(e) {
  // Cmd+K / Ctrl+K always open palette
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openPalette();
    return;
  }
  if (e.key === "Escape") {
    const pal = $("palette"), help = $("help-overlay"), prev = $("preview-pane");
    if (pal && !pal.hidden)  { e.preventDefault(); closePalette(); return; }
    if (help && !help.hidden) { e.preventDefault(); toggleHelp(); return; }
    if (prev && !prev.hidden) { e.preventDefault(); closePreview(); return; }
    if (isTyping(e.target)) { e.target.blur(); return; }
  }
  if (isTyping(e.target)) return;

  const r = focusedResult();
  const openFocused = () => { if (r) { window.open(r.url, "_blank", "noopener,noreferrer"); recordTrailClick(r); } };
  const handlers = {
    "j": () => focusResult(state.focusIndex + 1),
    "k": () => focusResult(state.focusIndex - 1),
    "o": openFocused,
    "Enter": openFocused,
    "c": () => { if (r && navigator.clipboard) navigator.clipboard.writeText(r.url).then(() => toast("URL copied")).catch(() => toast("copy failed")); },
    "e": toggleExplain,
    " ": togglePreview,
    "/": () => { const inp = $("q"); if (inp) { inp.focus(); inp.select(); } },
    "?": toggleHelp,
    "s": shareCurrentSearch,
  };
  if (handlers[e.key]) { e.preventDefault(); handlers[e.key](); return; }
  if (/^[1-9]$/.test(e.key)) { e.preventDefault(); focusResult(Number(e.key) - 1); }
}

// === localStorage: trail + recent ===

const TRAIL_KEY = "websearch:trail";
const RECENT_KEY = "websearch:recent";

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}

function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

function getTrail() { return loadJson(TRAIL_KEY, []); }

function getTrailEntry(url) {
  return getTrail().find((e) => e.url === url) || null;
}

function recordTrailClick(r) {
  const trail = getTrail();
  const next = [{ url: r.url, title: r.title, query: state.query, ts: Date.now() }, ...trail.filter((e) => e.url !== r.url)].slice(0, 200);
  saveJson(TRAIL_KEY, next);
}

function clearTrail() {
  saveJson(TRAIL_KEY, []);
  toast("trail cleared");
  rebuildResults(state.results);
}

function getRecentQueries() {
  return loadJson(RECENT_KEY, []);
}

function pushRecentQuery(q) {
  if (!q) return;
  const list = getRecentQueries().filter((x) => x !== q);
  list.unshift(q);
  saveJson(RECENT_KEY, list.slice(0, 20));
}

function goToQuery(q) {
  const u = new URL(window.location.href);
  u.searchParams.set("q", q);
  window.location.href = u.toString();
}

function setLens(name) {
  const u = new URL(window.location.href);
  u.searchParams.set("lens", name);
  window.location.href = u.toString();
}

// === share ===

async function shareCurrentSearch() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    toast("link copied");
  } catch {
    toast("copy failed");
  }
}

// === SSE wiring ===

function onStart(evt) {
  state.startedAt = evt.startedAt || Date.now();
  state.activeAdapters = evt.activeAdapters || [];
  initAdapterPills(state.activeAdapters);
  state.elapsedTimer = setInterval(updateElapsed, 100);
}

function onAdapter(evt) {
  updateAdapterPill(evt);
}

function onRanked(evt) {
  const results = evt.results || [];
  rebuildResults(results);
  const stats = $("stats");
  if (stats) {
    stats.hidden = false;
    stats.textContent = `${results.length} results · ${evt.totalCandidates} candidates · ${evt.adaptersReporting}/${evt.adaptersTotal} adapters`;
  }
  if (state.focusIndex < 0 && results.length > 0) {
    document.title = `${state.query} — websearch`;
  }
}

function onDone(evt) {
  state.done = true;
  state.cached = !!evt.cached;
  if (state.elapsedTimer) { clearInterval(state.elapsedTimer); state.elapsedTimer = null; }
  const elapsed = $("elapsed");
  if (elapsed) elapsed.textContent = `total: ${evt.totalMs}ms`;
  if (state.cached) {
    const pill = $("cached-pill");
    if (pill) pill.hidden = false;
  }
}

function attachSse() {
  if (!state.query) return;
  const url = `/stream/search?q=${encodeURIComponent(state.query)}&limit=${state.limit}`;
  const es = new EventSource(url);
  es.addEventListener("start", (e) => safeJson(e.data, onStart));
  es.addEventListener("adapter", (e) => safeJson(e.data, onAdapter));
  es.addEventListener("ranked", (e) => safeJson(e.data, onRanked));
  es.addEventListener("done", (e) => { safeJson(e.data, onDone); es.close(); });
  es.onerror = () => {
    if (state.done) return;
    const elapsed = $("elapsed");
    if (elapsed) elapsed.textContent = "connection lost";
    es.close();
  };
}

function safeJson(text, fn) {
  try { fn(JSON.parse(text)); } catch (err) { console.warn("bad sse payload", err); }
}

// === init ===

function init() {
  if (!root) return;
  const input = $("q");
  if (input) input.addEventListener("input", renderChips);
  renderChips();
  const form = $("search-form");
  if (form) form.addEventListener("submit", () => pushRecentQuery((input && input.value.trim()) || ""));
  const share = $("share-btn");
  if (share) share.addEventListener("click", shareCurrentSearch);
  const backdrop = $("palette-backdrop");
  if (backdrop) backdrop.addEventListener("click", closePalette);
  document.addEventListener("keydown", onKeyDown);
  if (state.query) {
    pushRecentQuery(state.query);
    attachSse();
  }
}

init();
