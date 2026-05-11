import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 4;

export function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.username = "";
  url.password = "";
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }
  return url.toString();
}

export function canonicalKey(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.username = "";
    url.password = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const drop = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "fbclid", "gclid", "mc_cid", "mc_eid"]);
    for (const key of [...url.searchParams.keys()]) {
      if (drop.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol}//${url.hostname}${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

export async function assertPublicHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  if (!url.hostname || url.username || url.password) {
    throw new Error("URL must not contain credentials");
  }
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length) throw new Error(`No DNS records for ${url.hostname}`);
  for (const address of addresses) {
    if (isPrivateAddress(address.address)) {
      throw new Error(`Blocked private address for ${url.hostname}`);
    }
  }
  return url;
}

export function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

function isPrivateIPv4(address) {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(address) {
  const value = address.toLowerCase();
  return (
    value === "::1" ||
    value === "::" ||
    value.startsWith("fe80:") ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("ff")
  );
}

export async function safeFetch(url, options = {}) {
  const {
    headers = {},
    timeoutMs = 10_000,
    maxBytes = 2_000_000,
    redirects = MAX_REDIRECTS,
    userAgent = "websearch/0.1",
    allowPrivate = false,
  } = options;

  let current = normalizeUrl(url);
  for (let redirect = 0; redirect <= redirects; redirect += 1) {
    if (!allowPrivate) await assertPublicHttpUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": userAgent,
        accept: headers.accept || "*/*",
        ...headers,
      },
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      current = normalizeUrl(new URL(response.headers.get("location"), current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${current}`);
    const buffer = await readLimited(response, maxBytes);
    return { url: current, response, buffer };
  }
  throw new Error(`Too many redirects for ${url}`);
}

export async function safeFetchJson(url, options = {}) {
  const { buffer, response } = await safeFetch(url, { ...options, headers: { accept: "application/json", ...(options.headers || {}) } });
  const text = buffer.toString("utf8");
  try {
    return { data: JSON.parse(text), response };
  } catch {
    throw new Error(`Invalid JSON from ${url}`);
  }
}

async function readLimited(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.from(await response.arrayBuffer());
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) throw new Error(`Response exceeded ${maxBytes} bytes`);
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
