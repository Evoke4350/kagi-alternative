import { safeFetchJson } from "../url.js";
import { stripHtml } from "../text.js";

export const name = "duckduckgo";
export const weight = 0.6;
export const capabilities = ["web", "facts"];

export async function search(query, ctx) {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");
  url.searchParams.set("t", "websearch");

  const { data } = await safeFetchJson(url.toString(), {
    userAgent: ctx.userAgent,
    timeoutMs: ctx.timeoutMs,
    headers: { accept: "*/*" },
  });

  const results = [];
  if (data?.AbstractURL && data?.Abstract) {
    results.push({
      url: data.AbstractURL,
      title: stripHtml(data.Heading || data.AbstractURL),
      snippet: stripHtml(data.AbstractText || data.Abstract),
      source: "duckduckgo",
      publishedAt: null,
    });
  }
  const topics = data?.RelatedTopics || [];
  for (const topic of topics) {
    if (results.length >= ctx.limit) break;
    if (!topic?.FirstURL || !topic?.Text) continue;
    results.push({
      url: topic.FirstURL,
      title: stripHtml(topic.Text.split(" - ")[0] || topic.Text),
      snippet: stripHtml(topic.Text),
      source: "duckduckgo",
      publishedAt: null,
    });
  }
  return results;
}
