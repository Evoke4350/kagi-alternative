export function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function truncate(value, max) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

export function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function highlight(text, tokens) {
  if (!tokens.length) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const pattern = new RegExp(`(${tokens.map(escapeRegex).join("|")})`, "gi");
  return escaped.replace(pattern, "<mark>$1</mark>");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "but", "are", "was", "were",
  "you", "your", "our", "their", "his", "her", "its", "all", "any", "some", "not",
  "have", "has", "had", "will", "would", "should", "could", "what", "when", "where",
  "how", "why", "who", "whom", "which",
]);
