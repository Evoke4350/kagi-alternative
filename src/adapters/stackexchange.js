import { safeFetchJson } from "../url.js";
import { stripHtml } from "../text.js";

export const name = "stackexchange";
export const weight = 0.7;
export const capabilities = ["code", "qa"];

export async function search(query, ctx) {
  const url = new URL("https://api.stackexchange.com/2.3/search/advanced");
  url.searchParams.set("q", query);
  url.searchParams.set("site", "stackoverflow");
  url.searchParams.set("pagesize", String(Math.min(ctx.limit, 30)));
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("filter", "default");

  const { data } = await safeFetchJson(url.toString(), {
    userAgent: ctx.userAgent,
    timeoutMs: ctx.timeoutMs,
    headers: { accept: "*/*" },
  });

  const items = data?.items || [];
  return items.map((item) => ({
    url: item.link,
    title: stripHtml(item.title || ""),
    snippet: stripHtml(item.body || `${item.score || 0} votes · ${item.answer_count || 0} answers`),
    source: "stackexchange",
    publishedAt: item.last_activity_date ? new Date(item.last_activity_date * 1000).toISOString() : null,
    meta: { score: item.score || 0, answers: item.answer_count || 0 },
  }));
}
