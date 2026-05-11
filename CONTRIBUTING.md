# Contributing

Thanks for considering a contribution. The project is intentionally small and zero-dependency. Keep it that way unless there is a strong reason not to.

## Ground rules

- Node 22+. No runtime dependencies. `devDependencies` only if absolutely necessary.
- All tests use `node --test`. No test framework dependencies.
- No client-side JavaScript on rendered pages. Server-rendered HTML only.
- Be careful with anything that hits the network. Use `safeFetch` / `safeFetchJson` from `src/url.js` — they enforce DNS-resolution checks, size limits, timeouts, redirect caps.

## Adding a search adapter

1. Create `src/adapters/<name>.js` exporting:
   ```js
   export const name = "myadapter";
   export const weight = 0.8;
   export async function search(query, ctx) { /* ... */ }
   ```
2. Return an array of `{ url, title, snippet, source, publishedAt? }` objects.
3. Register in `src/adapters/index.js`.
4. If the adapter requires a key, add it to `src/config.js` (`config.keys`) and to `adapterEnabled()`.
5. Add a fixture-driven test in `test/`. Mocking HTTP is fine — keep tests offline.

## Running

```sh
npm start          # server
npm test           # all tests
```

## Style

- Two-space indent.
- Avoid abstractions until there are three concrete callers.
- Comments only when the *why* is non-obvious. Names should carry the *what*.

## Reporting security issues

Email maintainer rather than filing a public issue. SSRF, prompt-injection through snippets, and lens-file path traversal are the highest-priority classes.
