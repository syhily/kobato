# `@kobato/sanitize`

The isomorphic DOMPurify stack — the single reason SSR and hydration bytes cannot drift. `config` (per-strategy
allowlists, incl. the server-only `feed` / `comment-email` strategies and the web `comment` strategy), `purify-core`
(every behavioral rule), `sanitize-html` (`sanitizeHtmlString` / `sanitizeHtml`), the engine bindings (`engine.node.ts`
— jsdom; `engine.browser.ts`), `escape-html` (the one `escapeHtml` for attribute-safe interpolation).

- Allowed deps: none (dompurify + jsdom are the only externals, both devDependencies).
- `engine.node.ts` is the ONE node exception in the shared umbrella; the `sanitize-html-engine-alias` vite plugin swaps
  it to `engine.browser.ts` in the client bundle (`apps/kobato/tests/arch/client-bundle.test.ts`).
- Tests: `tests/unit/` — parity, node, and browser engine suites (`shared-unit`).
