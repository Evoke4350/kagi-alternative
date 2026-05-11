import { safeFetchJson } from "../url.js";
import { stripHtml } from "../text.js";

export const name = "wikipedia";
export const weight = 0.8;

export async function search(query, ctx) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", String(Math.min(ctx.limit, 8)));
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("srprop", "snippet|timestamp");

  const { data } = await safeFetchJson(url.toString(), {
    userAgent: ctx.userAgent,
    timeoutMs: ctx.timeoutMs,
  });

  const items = data?.query?.search || [];
  return items.map((item) => ({
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
    title: item.title,
    snippet: stripHtml(item.snippet || ""),
    source: "wikipedia",
    publishedAt: item.timestamp || null,
  }));
}
