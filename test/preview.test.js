import test from "node:test";
import assert from "node:assert/strict";
import { extractPreview } from "../src/search/preview.js";

const BASE = "https://example.com/article";

test("extractPreview pulls title, description, and body text", () => {
  const html = `<!doctype html>
<html><head>
<title>Hello World</title>
<meta name="description" content="A nice page">
</head>
<body>
<p>Hello there.</p>
<p>This is a test.</p>
</body></html>`;
  const result = extractPreview(html, BASE);
  assert.equal(result.title, "Hello World");
  assert.equal(result.description, "A nice page");
  assert.ok(result.text.includes("Hello there."));
  assert.ok(result.text.includes("This is a test."));
  assert.equal(result.url, BASE);
  assert.equal(result.host, "example.com");
  assert.equal(result.imageUrl, null);
  assert.equal(result.publishedAt, null);
  assert.equal(typeof result.fetchedAt, "number");
});

test("extractPreview strips script content, including multiline injections", () => {
  const html = `<html><body>
<script>document.write("<body>injection</body>");
var x = 1;
</script>
<p>safe text</p>
</body></html>`;
  const result = extractPreview(html, BASE);
  assert.ok(!result.text.includes("injection"));
  assert.ok(!result.text.includes("document.write"));
  assert.ok(!result.text.includes("var x"));
  assert.ok(result.text.includes("safe text"));
});

test("extractPreview prefers og:title and og:description over basic tags", () => {
  const html = `<html><head>
<title>Basic</title>
<meta property="og:title" content="OG Title">
<meta name="description" content="Basic desc">
<meta property="og:description" content="OG Description">
<meta property="og:image" content="/image.jpg">
</head><body><p>Hi.</p></body></html>`;
  const result = extractPreview(html, BASE);
  assert.equal(result.title, "OG Title");
  assert.equal(result.description, "OG Description");
  assert.equal(result.imageUrl, "https://example.com/image.jpg");
});

test("extractPreview parses article:published_time to ISO", () => {
  const html = `<html><head><meta property="article:published_time" content="2024-03-15T12:34:00Z"></head><body></body></html>`;
  const result = extractPreview(html, BASE);
  assert.equal(result.publishedAt, "2024-03-15T12:34:00.000Z");
});

test("extractPreview parses itemprop datePublished as fallback", () => {
  const html = `<html><head><meta itemprop="datePublished" content="2023-01-02"></head><body></body></html>`;
  const result = extractPreview(html, BASE);
  assert.equal(result.publishedAt, new Date("2023-01-02").toISOString());
});

test("extractPreview parses <time datetime=...> as last fallback", () => {
  const html = `<html><body><time datetime="2022-06-07T08:09:10Z">June</time></body></html>`;
  const result = extractPreview(html, BASE);
  assert.equal(result.publishedAt, "2022-06-07T08:09:10.000Z");
});

test("extractPreview decodes named HTML entities including em-dash", () => {
  const html = `<html><body><p>Foo &amp; bar &mdash; baz</p></body></html>`;
  const result = extractPreview(html, BASE);
  assert.ok(result.text.includes("Foo & bar — baz"), `got: ${result.text}`);
});

test("extractPreview decodes numeric and hex entities", () => {
  const html = `<html><body><p>It&#39;s good &#x27;ish &#8212;done</p></body></html>`;
  const result = extractPreview(html, BASE);
  assert.ok(result.text.includes("It's good 'ish —done"), `got: ${result.text}`);
});

test("extractPreview caps text at 2000 chars with ellipsis", () => {
  const long = "x".repeat(5000);
  const html = `<html><body><p>${long}</p></body></html>`;
  const result = extractPreview(html, BASE);
  assert.ok(result.text.length <= 2001, `length is ${result.text.length}`);
  assert.ok(result.text.endsWith("…"));
});

test("extractPreview does not truncate short text", () => {
  const html = `<html><body><p>short content here</p></body></html>`;
  const result = extractPreview(html, BASE);
  assert.equal(result.text, "short content here");
  assert.ok(!result.text.endsWith("…"));
});

test("extractPreview skips data: URI as imageUrl", () => {
  const html = `<html><head><meta property="og:image" content="data:image/png;base64,iVBORw0KAAA"></head><body></body></html>`;
  const result = extractPreview(html, BASE);
  assert.equal(result.imageUrl, null);
});

test("extractPreview skips non-http(s) image schemes", () => {
  const html = `<html><head><meta property="og:image" content="javascript:alert(1)"></head><body></body></html>`;
  const result = extractPreview(html, BASE);
  assert.equal(result.imageUrl, null);
});

test("extractPreview preserves absolute http image URLs", () => {
  const html = `<html><head><meta property="og:image" content="https://cdn.example.org/a.png"></head><body></body></html>`;
  const result = extractPreview(html, BASE);
  assert.equal(result.imageUrl, "https://cdn.example.org/a.png");
});

test("extractPreview strips style, noscript, iframe, form, svg, and comments", () => {
  const html = `<html><head>
<style>body { color: red; } /* secret */</style>
</head><body>
<noscript>noscript-content</noscript>
<iframe src="x">iframe-content</iframe>
<form><input>form-content</form>
<svg><text>svg-content</text></svg>
<!-- comment-content -->
<p>visible</p>
</body></html>`;
  const result = extractPreview(html, BASE);
  assert.ok(!result.text.includes("secret"));
  assert.ok(!result.text.includes("noscript-content"));
  assert.ok(!result.text.includes("iframe-content"));
  assert.ok(!result.text.includes("form-content"));
  assert.ok(!result.text.includes("svg-content"));
  assert.ok(!result.text.includes("comment-content"));
  assert.ok(result.text.includes("visible"));
});

test("extractPreview collapses whitespace to single spaces", () => {
  const html = `<html><body><p>hello   world\n\n  newline</p></body></html>`;
  const result = extractPreview(html, BASE);
  assert.equal(result.text, "hello world newline");
});

test("extractPreview returns null for missing fields", () => {
  const html = `<html><body></body></html>`;
  const result = extractPreview(html, BASE);
  assert.equal(result.title, null);
  assert.equal(result.description, null);
  assert.equal(result.imageUrl, null);
  assert.equal(result.publishedAt, null);
});

test("extractPreview returns null publishedAt for unparseable dates", () => {
  const html = `<html><head><meta property="article:published_time" content="not-a-date"></head><body></body></html>`;
  const result = extractPreview(html, BASE);
  assert.equal(result.publishedAt, null);
});

test("extractPreview host strips www. and lowercases", () => {
  const result = extractPreview(`<html></html>`, "https://WWW.Example.COM/page");
  assert.equal(result.host, "example.com");
});

test("extractPreview falls back to whole document when no body tag", () => {
  const html = `<title>T</title><p>orphan paragraph</p>`;
  const result = extractPreview(html, BASE);
  assert.ok(result.text.includes("orphan paragraph"));
  assert.equal(result.title, "T");
});
