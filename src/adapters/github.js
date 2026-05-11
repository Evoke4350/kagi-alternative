import { safeFetchJson } from "../url.js";
import { stripHtml } from "../text.js";

export const name = "github";
export const weight = 0.7;
export const capabilities = ["code"];

export async function search(query, ctx) {
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", String(Math.min(ctx.limit, 30)));
  url.searchParams.set("sort", "stars");

  const headers = { accept: "application/vnd.github+json" };
  if (ctx.key) headers["authorization"] = `Bearer ${ctx.key}`;

  const { data } = await safeFetchJson(url.toString(), {
    userAgent: ctx.userAgent,
    timeoutMs: ctx.timeoutMs,
    headers,
  });

  const items = data?.items || [];
  return items.map((item) => ({
    url: item.html_url,
    title: stripHtml(item.full_name || ""),
    snippet: stripHtml(item.description || `${item.stargazers_count || 0} stars · ${item.language || "unknown"}`),
    source: "github",
    publishedAt: item.pushed_at || null,
    meta: { stars: item.stargazers_count || 0, language: item.language || null },
  }));
}
