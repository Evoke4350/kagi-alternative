import http from "node:http";
import { config } from "./config.js";
import { listAdapters } from "./adapters/index.js";
import { loadLens, normalizeLens } from "./search/lens.js";
import { metaSearch, metaSearchStream } from "./search/aggregate.js";
import { snapshot } from "./search/stats.js";
import { pruneExpired } from "./search/cache.js";
import { fetchPreview } from "./search/preview.js";
import { decodeLensFromUrl } from "./search/lens-url.js";
import { parseQuery } from "./search/operators.js";
import { serveStatic } from "./web/static/server.js";
import { aboutPage, homePage, notFoundPage, privacyPage, searchPage, searchPageStatic, sourcesPage, statsPage } from "./web/render.js";

const defaultLens = await loadLens(config.lensPath);

if (config.cache.enabled) {
  pruneExpired(config.cache.dir).catch(() => {});
  setInterval(() => pruneExpired(config.cache.dir).catch(() => {}), 10 * 60 * 1000).unref();
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/static/")) {
      return await serveStatic(request, response, url.pathname.slice("/static/".length));
    }

    if (url.pathname === "/api/search") return await apiSearch(url, response);
    if (url.pathname === "/api/sources") return json(response, { adapters: listAdapters() });
    if (url.pathname === "/api/stats") return json(response, { stats: snapshot(), adapters: listAdapters() });
    if (url.pathname === "/api/preview") return await apiPreview(url, response);
    if (url.pathname === "/api/operators") return json(response, parseQuery(url.searchParams.get("q") || ""));
    if (url.pathname === "/stream/search") return await streamSearch(request, url, response);

    if (url.pathname === "/") return html(response, homePage());
    if (url.pathname === "/search") {
      const query = (url.searchParams.get("q") || "").trim();
      return html(response, searchPage(query, { query }));
    }
    if (url.pathname === "/search-static") {
      const query = (url.searchParams.get("q") || "").trim();
      const requestLens = resolveLens(url);
      if (!query) return html(response, searchPageStatic("", { results: [], adapters: [], totalCandidates: 0, lens: requestLens.name }));
      const result = await metaSearch(query, requestLens, { limit: 20 });
      return html(response, searchPageStatic(query, result));
    }
    if (url.pathname === "/about") return html(response, aboutPage());
    if (url.pathname === "/privacy") return html(response, privacyPage());
    if (url.pathname === "/sources") return html(response, sourcesPage());
    if (url.pathname === "/stats") return html(response, statsPage(snapshot(), listAdapters()));
    return html(response, notFoundPage(), 404);
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ error: "internal_error", message: error.message }));
  }
});

server.listen(config.port, config.host, () => {
  console.log(`websearch listening on http://${config.host}:${config.port}`);
});

function resolveLens(url) {
  const param = url.searchParams.get("lens");
  if (!param) return defaultLens;
  const decoded = decodeLensFromUrl(param);
  if (!decoded) return defaultLens;
  return normalizeLens(decoded);
}

async function apiSearch(url, response) {
  const query = (url.searchParams.get("q") || "").trim();
  if (!query) return json(response, { query, results: [], adapters: [] });
  const limit = Math.min(50, Number(url.searchParams.get("limit") || 20));
  const requestLens = resolveLens(url);
  const result = await metaSearch(query, requestLens, { limit });
  json(response, result);
}

function html(response, body, status = 200) {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  response.end(body);
}

function json(response, payload, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function apiPreview(url, response) {
  const remote = url.searchParams.get("url");
  if (!remote) return jsonError(response, "missing url", 400);
  try {
    const preview = await fetchPreview(remote, { userAgent: config.userAgent });
    json(response, preview);
  } catch (error) {
    jsonError(response, error.message, 502);
  }
}

function jsonError(response, message, status) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify({ error: message }));
}

async function streamSearch(request, url, response) {
  const query = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(50, Number(url.searchParams.get("limit") || 20));
  const requestLens = resolveLens(url);

  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store, no-transform",
    "x-accel-buffering": "no",
    connection: "keep-alive",
  });

  const ping = setInterval(() => response.write(`:ping\n\n`), 15_000);
  request.on("close", () => clearInterval(ping));

  if (!query) {
    response.write(`event: done\ndata: ${JSON.stringify({ totalMs: 0 })}\n\n`);
    clearInterval(ping);
    return response.end();
  }

  try {
    await metaSearchStream(query, requestLens, { limit }, (name, data) => {
      response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    });
  } catch (error) {
    response.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
  } finally {
    clearInterval(ping);
    response.end();
  }
}
