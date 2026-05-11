import { safeFetchJson } from "../url.js";
import { stripHtml } from "../text.js";

export const name = "hackernews";
export const weight = 0.6;

export async function search(query, ctx) {
  const url = new URL("https://hn.algolia.com/api/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("tags", "story");
  url.searchParams.set("hitsPerPage", String(Math.min(ctx.limit, 10)));

  const { data } = await safeFetchJson(url.toString(), {
    userAgent: ctx.userAgent,
    timeoutMs: ctx.timeoutMs,
  });

  const hits = data?.hits || [];
  return hits
    .filter((hit) => hit.url)
    .map((hit) => ({
      url: hit.url,
      title: stripHtml(hit.title || ""),
      snippet: stripHtml(hit.story_text || `${hit.points || 0} points · ${hit.num_comments || 0} comments on Hacker News`),
      source: "hackernews",
      publishedAt: hit.created_at || null,
      meta: { points: hit.points || 0, comments: hit.num_comments || 0, hnId: hit.objectID },
    }));
}
