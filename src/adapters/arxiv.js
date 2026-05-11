import { safeFetch } from "../url.js";
import { stripHtml } from "../text.js";

export const name = "arxiv";
export const weight = 0.6;
export const capabilities = ["papers", "research"];

export async function search(query, ctx) {
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", `all:${query}`);
  url.searchParams.set("max_results", String(Math.min(ctx.limit, 25)));
  url.searchParams.set("sortBy", "relevance");

  const { buffer } = await safeFetch(url.toString(), {
    userAgent: ctx.userAgent,
    timeoutMs: ctx.timeoutMs,
    headers: { accept: "application/atom+xml" },
  });

  return parseArxivFeed(buffer.toString("utf8"));
}

export function parseArxivFeed(xml) {
  const entries = [];
  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const body = match[1];
    const title = pickTag(body, "title");
    const summary = pickTag(body, "summary");
    const id = pickTag(body, "id");
    const published = pickTag(body, "published");
    if (!id) continue;
    entries.push({
      url: id,
      title: stripHtml(title),
      snippet: stripHtml(summary),
      source: "arxiv",
      publishedAt: published || null,
    });
  }
  return entries;
}

function pickTag(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(xml);
  return m ? decodeEntities(m[1]).trim() : "";
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
