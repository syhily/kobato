# `@kobato/sanitize`

The isomorphic DOMPurify stack — the single reason SSR and hydration bytes cannot drift. Owner of: `config` (per-strategy allowlists, including the server-only `feed` / `comment-email` strategies and the `comment` strategy consumed by the web comment renderer), `purify-core` (every behavioral rule), `sanitize-html` (the `sanitizeHtmlString` / `sanitizeHtml` facade), the two engine bindings (`engine.node.ts` — jsdom; `engine.browser.ts`), `sanitize-url` (`isSafeUrl` and friends), and `escape-html` (the one `escapeHtml` for attribute-safe interpolation in mail templates and admin rows).

- Allowed deps: none — this is a leaf (dompurify + jsdom are the only externals, both devDependencies).
- The ONE node exception in the shared umbrella: `engine.node.ts` imports jsdom; the `sanitize-html-engine-alias` vite plugin swaps the specifier to `engine.browser.ts` in the client bundle (pinned by `apps/kobato/tests/arch/client-bundle.test.ts`'s jsdom `allowedIn` entry).
- Tests: `tests/unit/` — parity, node, and browser engine suites (umbrella `shared-unit` project — see `packages/shared/tests/AGENTS.md`).
