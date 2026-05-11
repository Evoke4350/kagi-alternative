import { safeFetchJson } from "../url.js";
import { stripHtml } from "../text.js";

export const name = "brave";
export const weight = 1.0;

export async function search(query, ctx) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(ctx.limit));
  url.searchParams.set("safesearch", "moderate");
  url.searchParams.set("text_decorations", "false");

  const { data } = await safeFetchJson(url.toString(), {
    userAgent: ctx.userAgent,
    timeoutMs: ctx.timeoutMs,
    headers: {
      "X-Subscription-Token": ctx.key,
      "Accept-Encoding": "gzip",
    },
  });

  const items = data?.web?.results || [];
  return items.map((item) => ({
    url: item.url,
    title: stripHtml(item.title || ""),
    snippet: stripHtml(item.description || ""),
    source: "brave",
    publishedAt: item.page_age || null,
  }));
}
