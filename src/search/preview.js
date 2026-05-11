import { safeFetch } from "../url.js";

const MAX_TEXT_LENGTH = 2000;

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  "#39": "'",
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export async function fetchPreview(rawUrl, options = {}) {
  const { userAgent } = options;
  const { url, buffer } = await safeFetch(rawUrl, {
    userAgent,
    timeoutMs: 8000,
    maxBytes: 500_000,
    headers: { accept: "text/html,*/*;q=0.8" },
  });
  const html = buffer.toString("utf8");
  return extractPreview(html, url);
}

export function extractPreview(html, baseUrl) {
  const sanitized = sanitize(String(html || ""));
  const title = extractTitle(sanitized);
  const description = extractDescription(sanitized);
  const imageUrl = extractImage(sanitized, baseUrl);
  const publishedAt = extractPublishedAt(sanitized);
  const text = extractText(sanitized);
  return {
    url: baseUrl,
    host: extractHost(baseUrl),
    title,
    description,
    text,
    publishedAt,
    imageUrl,
    fetchedAt: Date.now(),
  };
}

function sanitize(html) {
  let out = html;
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ");
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ");
  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ");
  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, " ");
  out = out.replace(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi, " ");
  out = out.replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, " ");
  out = out.replace(/<!--[\s\S]*?-->/g, " ");
  return out;
}

function extractTitle(html) {
  const og = matchMetaContent(html, /<meta\b[^>]*\bproperty\s*=\s*["']og:title["'][^>]*>/i);
  if (og) return decodeEntities(og).trim() || null;
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (match) {
    const value = decodeEntities(stripTags(match[1])).trim();
    return value || null;
  }
  return null;
}

function extractDescription(html) {
  const og = matchMetaContent(html, /<meta\b[^>]*\bproperty\s*=\s*["']og:description["'][^>]*>/i);
  if (og) return decodeEntities(og).trim() || null;
  const basic = matchMetaContent(html, /<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/i);
  if (basic) return decodeEntities(basic).trim() || null;
  return null;
}

function extractImage(html, baseUrl) {
  const value = matchMetaContent(html, /<meta\b[^>]*\bproperty\s*=\s*["']og:image["'][^>]*>/i);
  if (!value) return null;
  const decoded = decodeEntities(value).trim();
  if (!decoded) return null;
  if (/^data:/i.test(decoded)) return null;
  let resolved;
  try {
    resolved = new URL(decoded, baseUrl);
  } catch {
    return null;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
  return resolved.toString();
}

function extractPublishedAt(html) {
  const candidates = [
    matchMetaContent(html, /<meta\b[^>]*\bproperty\s*=\s*["']article:published_time["'][^>]*>/i),
    matchMetaContent(html, /<meta\b[^>]*\bitemprop\s*=\s*["']datePublished["'][^>]*>/i),
    matchAttr(html, /<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["'][^>]*>/i),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const decoded = decodeEntities(candidate).trim();
    if (!decoded) continue;
    const parsed = new Date(decoded);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function extractText(html) {
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  const stripped = stripTags(body);
  const decoded = decodeEntities(stripped);
  const collapsed = decoded.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_TEXT_LENGTH) return collapsed;
  return collapsed.slice(0, MAX_TEXT_LENGTH) + "…";
}

function extractHost(baseUrl) {
  try {
    return new URL(baseUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function matchMetaContent(html, tagPattern) {
  const tag = html.match(tagPattern);
  if (!tag) return null;
  const attrMatch = tag[0].match(/\bcontent\s*=\s*["']([^"']*)["']/i);
  return attrMatch ? attrMatch[1] : null;
}

function matchAttr(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1] : null;
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : match;
    });
}

function safeCodePoint(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}
