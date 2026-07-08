# websearch — open-source Kagi alternative for developers

> A **self-hosted, privacy-respecting search engine** built for engineers. Open-source. Hackable. Zero runtime dependencies. Designed to replace Kagi, SearXNG, and DuckDuckGo when you want one tool you actually control.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-22%2B-green.svg)](https://nodejs.org)
[![Zero dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen.svg)](package.json)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#status)

---

## Why websearch

You want the **Kagi experience — clean results, no ads, lenses, full keyboard control** — but you want it **open-source, on your hardware, paying $0/month, and easy to fork**.

websearch fans your query out to 11 search backends in parallel — including any local **SearXNG** instance, Brave Search, Mojeek, Marginalia, Wikipedia, Hacker News, GitHub, Stack Exchange, arXiv, DuckDuckGo, and Wiktionary — then **deduplicates, re-ranks, and applies your personal lens rules** before streaming results to the browser as they arrive. Every score is **fully explainable**. Every adapter is **30 lines of code**. Every config is a JSON file.

If you can read Node, you can change the ranking. That's the whole pitch.

## Comparison vs. existing search engines

| | websearch | [Kagi](https://kagi.com) | [SearXNG](https://github.com/searxng/searxng) | DuckDuckGo | Brave Search |
| --- | --- | --- | --- | --- | --- |
| Open source | ✅ MIT | ❌ closed | ✅ AGPL | ❌ | ❌ |
| Self-hostable | ✅ | ❌ | ✅ | ❌ | ❌ |
| Cost | free | $10/mo | free | free | free |
| Ranking transparency | ✅ per-result math | ❌ black box | ⚠️ engine-level only | ❌ | ❌ |
| Personal lenses | ✅ shareable JSON | ✅ proprietary | ⚠️ engine toggles | ❌ | ⚠️ Goggles |
| Streaming results (SSE) | ✅ rolling re-rank | ❌ | ❌ | ❌ | ❌ |
| Full keyboard nav | ✅ `j/k/o/c/e/Cmd-K/?` | ⚠️ partial | ❌ | ❌ | ❌ |
| Operator + bangs | ✅ `!gh site: -site: lang: before: type:` | ⚠️ partial | ✅ bangs | ✅ bangs only | ⚠️ |
| Explain rank breakdown | ✅ press `e` | ❌ | ❌ | ❌ | ❌ |
| Reader-mode preview | ✅ press `Space` | ✅ | ❌ | ❌ | ❌ |
| Zero runtime deps | ✅ | n/a | ❌ many | n/a | n/a |
| Hackable by a developer | ✅ ~2000 LOC | ❌ | ⚠️ Python + Flask | ❌ | ❌ |
| CLI client | ✅ `websearch "query"` | ❌ | ❌ | ❌ | ❌ |

## Features

### 11 search adapters out of the box

Each adapter is one small file in [`src/adapters/`](src/adapters/). Add a new one in 5 minutes.

- **SearXNG** — proxy any local SearXNG instance for Google/Bing/Qwant/Startpage results
- **Brave Search** — independent crawl (free tier API)
- **Mojeek** — independent UK crawler
- **Marginalia** — small-web-focused indie index
- **Wikipedia** — encyclopedia search
- **Wiktionary** — definitions
- **Hacker News** — Algolia-powered HN search
- **GitHub** — code & repo search
- **Stack Exchange** — Q&A across all Stack sites
- **arXiv** — research papers
- **DuckDuckGo Instant Answer** — disambiguation + abstracts

### Engineer-grade UX

- **SSE streaming** — results paint progressively as adapters return. First paint ~200 ms. Rolling re-rank visibly reshuffles top-10 as more data arrives.
- **Operator syntax with live chips** — `!gh react -site:reddit.com lang:rust before:2024 type:code` parses into colored chips above the input. Bangs, site filters, language, date range, capability filter, word exclusion.
- **Explain-rank panel** — press `e` on any result to expand a full breakdown: per-adapter position, RRF contribution, lexical score, weight, diversity boost, lens factor, and final score.
- **Reader-mode preview** — press `Space` to slide in a sanitized preview pane fetched server-side. No leaving the search.
- **Command palette** — `Cmd-K` (`Ctrl-K`) for recent queries, lens swap, navigation.
- **Full keyboard navigation** — `j/k` move, `o` open, `c` copy URL, `Enter` open, `1`-`9` jump, `/` focus, `?` cheatsheet, `Esc` close.
- **Local trail** — `localStorage`-only memory of clicked results. "Previously visited 3d ago" tag on familiar URLs. Never sent server-side.
- **Latency waterfall** — Chrome-devtools-style horizontal bars at the top of every search showing each adapter's response time.

### Privacy posture

- No accounts. No cookies. No telemetry. **No query logging.**
- Strict CSP: `script-src 'self'`, no inline scripts, no third-party origins.
- Outbound links carry `rel="noopener noreferrer nofollow"`, response sends `Referrer-Policy: no-referrer`.
- Disk cache uses **SHA-256 of (query, lens, limit)** as the filename — plaintext queries never touch disk.
- All HTTP egress goes through an SSRF-defended fetcher with DNS resolution checks, private-IP blocks, size + timeout caps, and redirect limits.

### Personal lenses (block / boost / downrank)

A lens is a JSON file. Drop yours in [`lenses/`](lenses/) and point `WEBSEARCH_LENS` at it.

```json
{
  "name": "tech",
  "block": ["pinterest.com", "quora.com"],
  "boost": [
    { "host": "github.com", "factor": 1.5 },
    { "host": "wikipedia.org", "factor": 1.3 }
  ],
  "downrank": [
    { "host": "medium.com", "factor": 0.5 }
  ]
}
```

**Lenses are shareable.** Click the share icon and your active lens is encoded into the URL as `?lens=<base64>`. Send the link, the recipient sees the same ranking. No server roundtrip, no account.

### Adapter performance tracking

- In-memory ring buffer (last 200 calls per adapter) tracks p50, p95, mean latency and error rate.
- `/stats` page renders a live table.
- After 5+ calls per adapter, **runtime weights are derived from latency** — fast, reliable adapters earn more rank weight.

### CLI client

```sh
websearch "openbsd security"
websearch --json "arch linux" | jq '.results[0]'
websearch --server http://192.168.1.10:3040 "kagi alternative"
echo "hyprland" | websearch
```

## Quickstart

### Local dev (3 commands)

```sh
git clone https://github.com/Evoke4350/kagi-alternative.git
cd websearch
npm start          # binds 0.0.0.0:3040
```

Open `http://localhost:3040`. No API keys needed — Wikipedia, Hacker News, GitHub, Stack Exchange, arXiv, DuckDuckGo, and Wiktionary all work without setup.

### Add SearXNG for proxied Google / Bing / Qwant

```sh
docker run -d --name searxng -p 127.0.0.1:8080:8080 \
  -e BASE_URL=http://localhost:8080/ \
  -e INSTANCE_NAME=websearch-local \
  searxng/searxng:latest

echo "WEBSEARCH_SEARXNG_BASE_URL=http://127.0.0.1:8080" >> .env
```

Make sure `formats: [html, json]` is in your SearXNG `settings.yml` (websearch talks JSON to it). Restart websearch — the SearXNG adapter is now active.

### Add Brave / Mojeek / GitHub keys (optional)

```sh
cp .env.example .env
$EDITOR .env       # paste BRAVE_API_KEY, MOJEEK_API_KEY, GITHUB_TOKEN
```

Restart. Visit `/sources` to verify which adapters are active.

### Docker Compose (websearch + SearXNG together)

```sh
docker compose up
```

Brings up both services on a private docker network. websearch on `http://localhost:3040`.

## Architecture

```
                ┌─ Wikipedia ─────┐
                ├─ Hacker News ───┤
   ┌────────┐   ├─ GitHub ────────┤   ┌──────────────┐   ┌──────────────────┐
   │ Browser│ ──▶ Stack Exchange ─├──▶│  Aggregator  │──▶│  Rank + Lens     │
   │ (SSE)  │   ├─ arXiv ─────────┤   │  (parallel)  │   │  + Explain       │
   └────────┘   ├─ DuckDuckGo ────┤   └──────────────┘   └──────────────────┘
                ├─ Wiktionary ────┤            │                    │
                ├─ SearXNG ───────┤            ▼                    ▼
                ├─ Brave ─────────┤      ┌──────────┐       ┌──────────────┐
                ├─ Mojeek ────────┤      │  Cache   │       │  /stream/    │
                └─ Marginalia ────┘      │  (sha256)│       │  search SSE  │
                                         └──────────┘       └──────────────┘
```

All code lives in `src/`. Backend is ~1500 LOC, frontend `app.js` ~770 LOC. Zero runtime dependencies. Tests run with Node's built-in `node --test`.

## Adapter API — add a new source in 5 minutes

```js
// src/adapters/myengine.js
import { safeFetchJson } from "../url.js";
import { stripHtml } from "../text.js";

export const name = "myengine";
export const weight = 0.8;
export const capabilities = ["web"];

export async function search(query, ctx) {
  const { data } = await safeFetchJson(
    `https://api.example.com/search?q=${encodeURIComponent(query)}`,
    { userAgent: ctx.userAgent, timeoutMs: ctx.timeoutMs }
  );
  return data.results.map((r) => ({
    url: r.link,
    title: stripHtml(r.title),
    snippet: stripHtml(r.snippet),
    source: "myengine",
    publishedAt: r.date || null,
  }));
}
```

Register in [`src/adapters/index.js`](src/adapters/index.js). Restart. Done. The aggregator, dedup, ranker, lens, explain, cache, and frontend already handle it.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Home |
| `GET` | `/search?q=&lens=` | Streaming search page |
| `GET` | `/search-static?q=&lens=` | Server-rendered fallback (`<noscript>`) |
| `GET` | `/stream/search?q=&limit=&lens=` | Server-Sent Events stream |
| `GET` | `/api/search?q=&limit=&lens=` | JSON metasearch |
| `GET` | `/api/sources` | Adapter list with capabilities + status |
| `GET` | `/api/stats` | Live latency + error stats per adapter |
| `GET` | `/api/preview?url=` | Reader-mode preview |
| `GET` | `/api/operators?q=` | Parsed operator tree (debugging) |
| `GET` | `/sources` | HTML adapter table |
| `GET` | `/stats` | HTML latency dashboard |
| `GET` | `/privacy` | Privacy posture |
| `GET` | `/static/*` | Frontend assets |

## MCP server — give your local LLM web search

`bin/websearch-mcp.js` is a zero-dependency [MCP](https://modelcontextprotocol.io)
stdio server exposing the full fan-out → dedupe → rank → lens pipeline as a
`web_search` tool. Any MCP host (LM Studio, Claude Desktop, agent frameworks)
can call it; tool-capable local models (e.g. Qwen3) get grounded answers with
your ranking and your privacy posture.

```jsonc
// LM Studio mcp.json (or Claude Desktop claude_desktop_config.json)
{
  "mcpServers": {
    "websearch": {
      "command": "node",
      "args": ["/absolute/path/to/websearch/bin/websearch-mcp.js"]
    }
  }
}
```

Tool arguments: `query` (required), `limit` (default 8, cap 20), `lens`
(any name from `lenses/`). Results come back as a numbered list of
title / URL / snippet — LLM-friendly, explainable, no API keys.


## Configuration

All via `.env` (loaded at startup) or environment variables.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3040` | HTTP port |
| `HOST` | `0.0.0.0` | Bind host (`0.0.0.0` for LAN access) |
| `WEBSEARCH_SEARXNG_BASE_URL` | — | Self-hosted SearXNG instance URL |
| `BRAVE_API_KEY` | — | Brave Search API key |
| `MOJEEK_API_KEY` | — | Mojeek API key |
| `MARGINALIA_API_KEY` | — | Marginalia API key |
| `GITHUB_TOKEN` | — | GitHub PAT (raises rate limit) |
| `WEBSEARCH_LENS` | `lenses/default.json` | Active lens file |
| `WEBSEARCH_CACHE` | `on` | `off` to disable disk cache |
| `WEBSEARCH_CACHE_DIR` | `data/cache` | Cache directory |
| `WEBSEARCH_CACHE_TTL_MS` | `3600000` | Cache entry lifetime (1 h) |

## Roadmap

- [x] Phase 1: meta-search over 5 free adapters
- [x] Phase 2: 6 more adapters, disk cache, stats, CLI, Docker, CI
- [x] Phase 3: SSE streaming, operators, explain-rank, command palette, full keyboard nav, lens-URL share, latency-aware weighting
- [ ] **Phase 4**: source-diff modal (compare how each engine described the same URL), counter-search sidecar (auto-find opposing perspective), saved searches
- [ ] **Phase 5**: local Common Crawl subset → Tantivy/Lucene index
- [ ] **Phase 5**: embeddings-based re-rank on top-50 (small model, browser-side WASM)
- [ ] **Phase 6**: optional LLM answer layer over snippets (opt-in, transparent token cost)
- [ ] More adapters: Searxng goggles, You.com, Exa, Tavily, Lobsters RSS, Invidious, MusicBrainz, Semantic Scholar
- [ ] Goggles-compatible lens format (so users can import Brave Search Goggles)
- [ ] PWA install + offline cached previews

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Adapters are the easiest entry point — one file, no glue. The codebase is small enough to read in an afternoon.

## Comparable projects worth knowing

- [SearXNG](https://github.com/searxng/searxng) — the elder statesman of open metasearch. We use it as one of our adapters.
- [Kagi](https://kagi.com) — closed-source paid search that pioneered lenses and the "anti-spam" approach. Major design inspiration.
- [Marginalia](https://marginalia-search.com) — handcrafted small-web search engine. Adapter included.
- [Brave Search](https://search.brave.com) — independent crawl with an open API. Adapter included.
- [Stract](https://stract.com) — open-source web search engine with its own crawler.
- [Mwmbl](https://github.com/mwmbl/mwmbl) — open-source web search by crowdsourced index.

## License

MIT. See [LICENSE](LICENSE).

## Keywords

`open-source kagi alternative`, `self-hosted search engine`, `privacy search engine`, `searxng frontend`, `metasearch engine nodejs`, `developer search engine`, `hackable search`, `zero dependency search engine`, `streaming search results`, `explainable ranking`, `personal search lens`
