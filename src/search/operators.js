const BANGS = {
  w: "wikipedia",
  wiki: "wikipedia",
  gh: "github",
  github: "github",
  hn: "hackernews",
  so: "stackexchange",
  stack: "stackexchange",
  arx: "arxiv",
  arxiv: "arxiv",
  ddg: "duckduckgo",
  wkt: "wiktionary",
  wiktionary: "wiktionary",
  sx: "searxng",
  searxng: "searxng",
};

export function parseQuery(raw) {
  const parsed = {
    query: "",
    raw: raw || "",
    bang: null,
    site: { include: [], exclude: [] },
    lang: [],
    before: null,
    after: null,
    type: [],
    minus: [],
    chips: [],
  };
  if (!raw) return parsed;

  const tokens = String(raw).split(/\s+/).filter(Boolean);
  const queryParts = [];

  for (const token of tokens) {
    if (token.startsWith("!") && token.length > 1) {
      const key = token.slice(1).toLowerCase();
      const adapter = BANGS[key];
      if (adapter) {
        if (parsed.bang === null) {
          parsed.bang = adapter;
          parsed.chips.push({ kind: "bang", label: token, raw: token, value: adapter });
        }
        continue;
      }
      // Unknown bang: keep as plain query text
      queryParts.push(token);
      continue;
    }

    if (token.startsWith("-site:") && token.length > 6) {
      const host = normalizeHost(token.slice(6));
      if (host) {
        parsed.site.exclude.push(host);
        parsed.chips.push({ kind: "site-exclude", label: token, raw: token, value: host });
      }
      continue;
    }

    if (token.startsWith("site:") && token.length > 5) {
      const host = normalizeHost(token.slice(5));
      if (host) {
        parsed.site.include.push(host);
        parsed.chips.push({ kind: "site-include", label: token, raw: token, value: host });
      }
      continue;
    }

    if (token.startsWith("lang:") && token.length > 5) {
      const code = token.slice(5).toLowerCase();
      if (code) {
        parsed.lang.push(code);
        parsed.chips.push({ kind: "lang", label: token, raw: token, value: code });
      }
      continue;
    }

    if (token.startsWith("before:") && token.length > 7) {
      const date = normalizeDate(token.slice(7));
      if (date) {
        parsed.before = date;
        parsed.chips.push({ kind: "before", label: token, raw: token, value: date });
      }
      continue;
    }

    if (token.startsWith("after:") && token.length > 6) {
      const date = normalizeDate(token.slice(6));
      if (date) {
        parsed.after = date;
        parsed.chips.push({ kind: "after", label: token, raw: token, value: date });
      }
      continue;
    }

    if (token.startsWith("type:") && token.length > 5) {
      const caps = token.slice(5).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (caps.length) {
        parsed.type.push(...caps);
        parsed.chips.push({ kind: "type", label: token, raw: token, value: caps });
      }
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      const word = token.slice(1);
      parsed.minus.push(word);
      parsed.chips.push({ kind: "minus", label: token, raw: token, value: word });
      continue;
    }

    queryParts.push(token);
  }

  parsed.query = queryParts.join(" ");
  return parsed;
}

export function adapterFilter(parsed, listAdapters) {
  const all = Array.isArray(listAdapters) ? listAdapters : [];
  if (parsed.bang) {
    return all.filter((a) => a.name === parsed.bang).map((a) => a.name);
  }
  if (parsed.type && parsed.type.length) {
    const wanted = new Set(parsed.type);
    return all
      .filter((a) => (a.capabilities || []).some((c) => wanted.has(c)))
      .map((a) => a.name);
  }
  return all.map((a) => a.name);
}

export function postFilter(results, parsed) {
  if (!Array.isArray(results)) return [];
  const includeHosts = parsed.site.include;
  const excludeHosts = parsed.site.exclude;
  const minus = (parsed.minus || []).map((w) => w.toLowerCase());
  const beforeTs = parsed.before ? Date.parse(parsed.before) : NaN;
  const afterTs = parsed.after ? Date.parse(parsed.after) : NaN;

  return results.filter((result) => {
    const host = hostOf(result.url);
    if (includeHosts.length) {
      if (!host) return false;
      if (!includeHosts.some((h) => hostMatches(host, h))) return false;
    }
    if (excludeHosts.length && host) {
      if (excludeHosts.some((h) => hostMatches(host, h))) return false;
    }
    if (minus.length) {
      const hay = `${result.title || ""} ${result.snippet || ""}`.toLowerCase();
      if (minus.some((w) => hay.includes(w))) return false;
    }
    if (!Number.isNaN(beforeTs) || !Number.isNaN(afterTs)) {
      const ts = result.publishedAt ? Date.parse(result.publishedAt) : NaN;
      if (!Number.isNaN(ts)) {
        if (!Number.isNaN(beforeTs) && ts >= beforeTs) return false;
        if (!Number.isNaN(afterTs) && ts <= afterTs) return false;
      }
    }
    return true;
  });
}

function normalizeDate(value) {
  const v = String(value || "").trim();
  if (/^\d{4}$/.test(v)) return `${v}-01-01`;
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return null;
}

function normalizeHost(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostMatches(host, pattern) {
  if (!pattern) return false;
  if (pattern === host) return true;
  return host.endsWith(`.${pattern}`);
}
