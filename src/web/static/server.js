import { readFile } from "node:fs/promises";
import { resolve, normalize, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATIC_ROOT = resolve(HERE);

const TYPES = {
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

export async function serveStatic(request, response, urlPath) {
  const safe = normalize(urlPath).replace(/^[\/\\]+/, "");
  if (safe.includes("..") || safe.startsWith("/") || safe.startsWith(sep)) return notFound(response);
  const fullPath = resolve(STATIC_ROOT, safe);
  if (!fullPath.startsWith(STATIC_ROOT + sep) && fullPath !== STATIC_ROOT) return notFound(response);
  try {
    const data = await readFile(fullPath);
    const ext = "." + (safe.split(".").pop() || "");
    response.writeHead(200, {
      "content-type": TYPES[ext] || "application/octet-stream",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    });
    response.end(data);
  } catch {
    notFound(response);
  }
}

function notFound(response) {
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("not found");
}
