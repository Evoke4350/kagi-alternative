import { safeFetchJson } from "../url.js";
import { stripHtml } from "../text.js";

export const name = "searxng";
export const weight = 1.0;
export const capabilities = ["web"];

export async function search(query, ctx) {
  const base = ctx.extras?.searxngBaseUrl;
  if (!base) return [];

  const url = new URL("/search", base);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("safesearch", "1");

  const { data } = await safeFetchJson(url.toString(), {
    userAgent: ctx.userAgent,
    timeoutMs: ctx.timeoutMs,
    headers: { accept: "*/*" },
    allowPrivate: true,
  });

  const items = data?.results || [];
  return items.slice(0, ctx.limit).map((item) => ({
    url: item.url,
    title: stripHtml(item.title || ""),
    snippet: stripHtml(item.content || ""),
    source: "searxng",
    publishedAt: item.publishedDate || null,
    meta: { engine: item.engine || null },
  }));
}
