import { safeFetchJson } from "../url.js";
import { stripHtml } from "../text.js";

export const name = "mojeek";
export const weight = 0.9;

export async function search(query, ctx) {
  const url = new URL("https://www.mojeek.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("api_key", ctx.key);
  url.searchParams.set("t", String(ctx.limit));

  const { data } = await safeFetchJson(url.toString(), {
    userAgent: ctx.userAgent,
    timeoutMs: ctx.timeoutMs,
  });

  const items = data?.response?.results || [];
  return items.map((item) => ({
    url: item.url,
    title: stripHtml(item.title || ""),
    snippet: stripHtml(item.desc || ""),
    source: "mojeek",
    publishedAt: item.pubdate || null,
  }));
}
