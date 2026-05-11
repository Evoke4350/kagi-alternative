import test from "node:test";
import assert from "node:assert/strict";
import {
  aboutPage,
  homePage,
  layoutStreaming,
  notFoundPage,
  privacyPage,
  searchPage,
  searchPageStatic,
  sourcesPage,
  statsPage,
} from "../src/web/render.js";

test("searchPage returns streaming shell with module script tag", () => {
  const html = searchPage("hyprland", {});
  assert.ok(html.includes(`<script type="module" src="/static/app.js"></script>`), "script tag present");
});

test("searchPage embeds the query as data attribute on root", () => {
  const html = searchPage("hyprland", {});
  assert.ok(html.includes(`data-query="hyprland"`), "data-query present");
});

test("searchPage references external stylesheet", () => {
  const html = searchPage("hyprland", {});
  assert.ok(html.includes(`<link rel="stylesheet" href="/static/style.css">`), "stylesheet link present");
});

test("searchPage contains a <noscript> fallback", () => {
  const html = searchPage("hyprland", {});
  assert.ok(html.includes("<noscript>"), "<noscript> present");
});

test("searchPage with empty query uses plain layout (no JS)", () => {
  const html = searchPage("", {});
  assert.ok(!html.includes(`/static/app.js`), "no app.js for empty query");
  assert.ok(html.includes("<style>"), "inline style present");
});

test("searchPage escapes the query in the data attribute", () => {
  const html = searchPage(`evil"<script>`, {});
  assert.ok(!html.includes(`evil"<script>`), "raw injection rejected");
  assert.ok(html.includes("&lt;script&gt;") || html.includes("&quot;"), "escaped");
});

test("non-search pages still use inline <style>", () => {
  for (const html of [homePage(), aboutPage(), privacyPage(), sourcesPage(), notFoundPage()]) {
    assert.ok(html.includes("<style>"), "inline style block present");
    assert.ok(!html.includes(`/static/app.js`), "no JS injected on non-search page");
    assert.ok(!html.includes(`<link rel="stylesheet" href="/static/style.css">`), "no external stylesheet");
  }
  // statsPage takes args
  const sHtml = statsPage([], []);
  assert.ok(sHtml.includes("<style>"), "stats inline style block present");
  assert.ok(!sHtml.includes(`/static/app.js`), "no JS on stats page");
});

test("layoutStreaming includes module script and external stylesheet", () => {
  const html = layoutStreaming({ title: "x", query: "foo", body: "<p>hi</p>" });
  assert.ok(html.includes(`<script type="module" src="/static/app.js"></script>`));
  assert.ok(html.includes(`<link rel="stylesheet" href="/static/style.css">`));
  assert.ok(!html.includes("<style>"), "no inline style in streaming layout");
});

test("searchPageStatic still produces server-rendered results (legacy/noscript)", () => {
  const html = searchPageStatic("hyprland", {
    results: [{ url: "https://example.com/", host: "example.com", title: "Hi", snippet: "hello", sources: ["brave"], score: 1.23 }],
    adapters: [{ name: "brave", ok: true, count: 1 }],
    totalCandidates: 1,
    lens: "default",
  });
  assert.ok(html.includes("example.com"));
  assert.ok(html.includes("<style>"), "legacy path keeps inline style");
});
