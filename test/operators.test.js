import test from "node:test";
import assert from "node:assert/strict";
import { parseQuery, adapterFilter, postFilter } from "../src/search/operators.js";

test("empty query returns empty parsed structure", () => {
  const p = parseQuery("");
  assert.equal(p.query, "");
  assert.equal(p.raw, "");
  assert.equal(p.bang, null);
  assert.deepEqual(p.site, { include: [], exclude: [] });
  assert.deepEqual(p.lang, []);
  assert.equal(p.before, null);
  assert.equal(p.after, null);
  assert.deepEqual(p.type, []);
  assert.deepEqual(p.minus, []);
  assert.deepEqual(p.chips, []);
});

test("single bang resolves to adapter name", () => {
  const p = parseQuery("!gh react hooks");
  assert.equal(p.bang, "github");
  assert.equal(p.query, "react hooks");
  assert.equal(p.chips[0].kind, "bang");
  assert.equal(p.chips[0].value, "github");
  assert.equal(p.chips[0].raw, "!gh");
});

test("first bang wins, later bangs ignored", () => {
  const p = parseQuery("!gh !hn topic");
  assert.equal(p.bang, "github");
  assert.equal(p.query, "topic");
});

test("unknown bang ignored: no adapter restriction, treated as plain text", () => {
  const p = parseQuery("!unknown react");
  assert.equal(p.bang, null);
  assert.equal(p.query, "!unknown react");
});

test("bang aliases all resolve correctly", () => {
  assert.equal(parseQuery("!w x").bang, "wikipedia");
  assert.equal(parseQuery("!wiki x").bang, "wikipedia");
  assert.equal(parseQuery("!gh x").bang, "github");
  assert.equal(parseQuery("!github x").bang, "github");
  assert.equal(parseQuery("!hn x").bang, "hackernews");
  assert.equal(parseQuery("!so x").bang, "stackexchange");
  assert.equal(parseQuery("!stack x").bang, "stackexchange");
  assert.equal(parseQuery("!arx x").bang, "arxiv");
  assert.equal(parseQuery("!arxiv x").bang, "arxiv");
  assert.equal(parseQuery("!ddg x").bang, "duckduckgo");
  assert.equal(parseQuery("!wkt x").bang, "wiktionary");
  assert.equal(parseQuery("!wiktionary x").bang, "wiktionary");
  assert.equal(parseQuery("!sx x").bang, "searxng");
  assert.equal(parseQuery("!searxng x").bang, "searxng");
});

test("site: and -site: collected separately", () => {
  const p = parseQuery("site:github.com -site:reddit.com -site:medium.com docs");
  assert.deepEqual(p.site.include, ["github.com"]);
  assert.deepEqual(p.site.exclude, ["reddit.com", "medium.com"]);
  assert.equal(p.query, "docs");
});

test("bare -word (not -site:) collected into minus", () => {
  const p = parseQuery("rust -windows -mac tutorial");
  assert.deepEqual(p.minus, ["windows", "mac"]);
  assert.equal(p.query, "rust tutorial");
});

test("before:YYYY normalized to YYYY-01-01", () => {
  const p = parseQuery("before:2024 foo");
  assert.equal(p.before, "2024-01-01");
  assert.equal(p.query, "foo");
});

test("before:YYYY-MM normalized to YYYY-MM-01", () => {
  const p = parseQuery("before:2024-06 foo");
  assert.equal(p.before, "2024-06-01");
});

test("before:YYYY-MM-DD stays the same", () => {
  const p = parseQuery("before:2024-12-01 foo");
  assert.equal(p.before, "2024-12-01");
});

test("after: works the same as before:", () => {
  const p = parseQuery("after:2020-03 foo");
  assert.equal(p.after, "2020-03-01");
});

test("duplicate before: last wins", () => {
  const p = parseQuery("before:2024 before:2020 x");
  assert.equal(p.before, "2020-01-01");
});

test("type:code,papers parsed as array", () => {
  const p = parseQuery("type:code,papers react");
  assert.deepEqual(p.type, ["code", "papers"]);
  assert.equal(p.query, "react");
});

test("lang: repeatable", () => {
  const p = parseQuery("lang:en lang:rust topic");
  assert.deepEqual(p.lang, ["en", "rust"]);
  assert.equal(p.query, "topic");
});

test("combined operators all stripped from query", () => {
  const raw = "!gh site:github.com -site:reddit.com lang:en before:2024 type:code -spam react server components";
  const p = parseQuery(raw);
  assert.equal(p.query, "react server components");
  assert.equal(p.bang, "github");
  assert.deepEqual(p.site.include, ["github.com"]);
  assert.deepEqual(p.site.exclude, ["reddit.com"]);
  assert.deepEqual(p.lang, ["en"]);
  assert.equal(p.before, "2024-01-01");
  assert.deepEqual(p.type, ["code"]);
  assert.deepEqual(p.minus, ["spam"]);
  assert.equal(p.raw, raw);
  assert.equal(p.chips.length, 7);
});

test("chips preserve source order", () => {
  const p = parseQuery("site:a.com !gh -site:b.com");
  assert.deepEqual(p.chips.map((c) => c.kind), ["site-include", "bang", "site-exclude"]);
});

const adapters = [
  { name: "wikipedia", capabilities: ["facts", "definitions"] },
  { name: "github", capabilities: ["code"] },
  { name: "arxiv", capabilities: ["papers", "research"] },
  { name: "hackernews", capabilities: ["news"] },
  { name: "duckduckgo", capabilities: ["web"] },
];

test("adapterFilter with bang returns only that adapter", () => {
  const p = parseQuery("!gh foo");
  assert.deepEqual(adapterFilter(p, adapters), ["github"]);
});

test("adapterFilter with type returns capability intersection", () => {
  const p = parseQuery("type:code,papers foo");
  const names = adapterFilter(p, adapters);
  assert.ok(names.includes("github"));
  assert.ok(names.includes("arxiv"));
  assert.ok(!names.includes("wikipedia"));
  assert.ok(!names.includes("hackernews"));
});

test("adapterFilter with no constraints returns all", () => {
  const p = parseQuery("foo");
  const names = adapterFilter(p, adapters);
  assert.equal(names.length, adapters.length);
});

test("adapterFilter bang beats type", () => {
  const p = parseQuery("!hn type:code foo");
  assert.deepEqual(adapterFilter(p, adapters), ["hackernews"]);
});

test("postFilter excludes by -site:", () => {
  const p = parseQuery("-site:reddit.com foo");
  const results = [
    { url: "https://reddit.com/x", title: "r", snippet: "" },
    { url: "https://www.reddit.com/y", title: "r2", snippet: "" },
    { url: "https://example.com/z", title: "e", snippet: "" },
  ];
  const out = postFilter(results, p);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, "https://example.com/z");
});

test("postFilter site:include whitelists hosts and subdomains", () => {
  const p = parseQuery("site:github.com foo");
  const results = [
    { url: "https://github.com/x", title: "", snippet: "" },
    { url: "https://docs.github.com/y", title: "", snippet: "" },
    { url: "https://gitlab.com/z", title: "", snippet: "" },
  ];
  const out = postFilter(results, p);
  assert.equal(out.length, 2);
});

test("postFilter excludes results containing minus word in title or snippet", () => {
  const p = parseQuery("-spam foo");
  const results = [
    { url: "https://a.com/1", title: "Spam alert", snippet: "" },
    { url: "https://b.com/2", title: "ok", snippet: "contains SPAM here" },
    { url: "https://c.com/3", title: "clean", snippet: "fine" },
  ];
  const out = postFilter(results, p);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, "https://c.com/3");
});

test("postFilter applies before: against publishedAt", () => {
  const p = parseQuery("before:2024-01-01 foo");
  const results = [
    { url: "https://a.com/1", title: "", snippet: "", publishedAt: "2023-06-01" },
    { url: "https://b.com/2", title: "", snippet: "", publishedAt: "2025-06-01" },
    { url: "https://c.com/3", title: "", snippet: "", publishedAt: "unparseable" },
  ];
  const out = postFilter(results, p);
  assert.equal(out.length, 2);
  assert.ok(out.find((r) => r.url === "https://a.com/1"));
  assert.ok(out.find((r) => r.url === "https://c.com/3"));
});

test("postFilter applies after: against publishedAt", () => {
  const p = parseQuery("after:2024-01-01 foo");
  const results = [
    { url: "https://a.com/1", title: "", snippet: "", publishedAt: "2023-06-01" },
    { url: "https://b.com/2", title: "", snippet: "", publishedAt: "2025-06-01" },
  ];
  const out = postFilter(results, p);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, "https://b.com/2");
});

test("postFilter with no operators returns input unchanged", () => {
  const p = parseQuery("foo");
  const results = [{ url: "https://a.com/1", title: "x", snippet: "y" }];
  const out = postFilter(results, p);
  assert.equal(out.length, 1);
});
