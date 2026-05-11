import { safeFetchJson } from "../url.js";
import { stripHtml } from "../text.js";

export const name = "marginalia";
export const weight = 0.7;

export async function search(query, ctx) {
  const key = ctx.key || "test";
  const url = `https://api.marginalia-search.com/${encodeURIComponent(key)}/search/${encodeURIComponent(query)}?count=${ctx.limit}`;

  const { data } = await safeFetchJson(url, {
    userAgent: ctx.userAgent,
    timeoutMs: ctx.timeoutMs,
    headers: { accept: "*/*" },
  });

  const items = data?.results || [];
  return items.map((item) => ({
    url: item.url,
    title: stripHtml(item.title || ""),
    snippet: stripHtml(item.description || ""),
    source: "marginalia",
    publishedAt: null,
  }));
}
