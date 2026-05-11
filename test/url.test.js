import test from "node:test";
import assert from "node:assert/strict";
import { canonicalKey, isPrivateAddress, normalizeUrl } from "../src/url.js";

test("isPrivateAddress flags loopback and rfc1918", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("10.0.0.1"), true);
  assert.equal(isPrivateAddress("192.168.1.1"), true);
  assert.equal(isPrivateAddress("172.16.0.1"), true);
  assert.equal(isPrivateAddress("169.254.169.254"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
});

test("isPrivateAddress flags ipv6 loopback and link-local", () => {
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isPrivateAddress("fe80::1"), true);
  assert.equal(isPrivateAddress("fc00::1"), true);
  assert.equal(isPrivateAddress("2001:4860:4860::8888"), false);
});

test("normalizeUrl strips creds, fragment, default port", () => {
  assert.equal(
    normalizeUrl("https://user:pass@Example.com:443/x#frag"),
    "https://example.com/x",
  );
});

test("canonicalKey drops utm_* and trailing slash", () => {
  assert.equal(
    canonicalKey("https://www.example.com/path/?utm_source=foo&keep=1"),
    "https://example.com/path?keep=1",
  );
});
