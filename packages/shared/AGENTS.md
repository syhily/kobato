# Shared umbrella conventions

`packages/shared/` is not a package: it is an umbrella of nine workspace leaf packages (`packages/shared/<name>` ↔ `@kobato/<name>`), the successor of the former single `@kobato/shared`. There is deliberately no umbrella package.json, no barrel, and no way to import "shared" as one unit — consumers import a concrete leaf module. `packages/shared/tests/` holds only the umbrella vitest roots, not source.

## Umbrella rules (every leaf)

- **Runtime-isomorphic, React-free.** Safe in both bundles with no polyfills: no `node:*` value imports, no DOM-only APIs, no direct `process.env`, no `console.*`, and no React — no components, no hooks, no JSX, no `react`/`react-dom` value OR type imports (`apps/kobato/tests/arch/shared-react-free.test.ts`). The one sanctioned node dependency is `@kobato/sanitize`'s `engine.node.ts` (jsdom); the `sanitize-html-engine-alias` vite plugin swaps it to `engine.browser.ts` in the client bundle (pinned by `apps/kobato/tests/arch/client-bundle.test.ts`).
- **Junk-drawer guard.** A new module lands in a leaf only with a REAL cross-package consumer (two or more product packages reading the same shape) or inside that leaf's already-cohesive family (wire schemas in contracts, the lexical schema family, locale catalogs, the settings projection). A module with a single consumer belongs to that consumer; "it is pure" / "isomorphic-safe" / "could be shared someday" is not a reason.
- **Do not re-form the junk drawer.** The nine-way split exists so each leaf has one reason to exist; do not grow a leaf into a generic dumping ground, and do not relocate a consumer-owned module back in.
- **Direct source imports, no barrels.** Each leaf exports `./*`; consumers import `@kobato/<leaf>/<module>.ts` straight from the source file. No `export { X } from 'y'` re-exports, no leaf-level `index.ts`.
- **Error handling.** Leaves have no logger (server and client each bring their own): throw, and let the server or client boundary catch and log it.

## The nine leaves

- `@kobato/utils` — pure isomorphic helpers (`slug`, `safe-url`, `security`, `memo`, `toc`, `thumbhash`, `zod-issue-bounds`, …) plus the display `format` facade and `version`.
- `@kobato/i18n` — locale contract, ICU message catalogs (`messages/ui` + `messages/server`), the `catalog-scope` classifier, `fallback-messages`, and the `inkling-labels` editor tables.
- `@kobato/cache` — the cache-bucket declaration registry and derived bucket id unions. Declarations only — never a storage plane.
- `@kobato/settings` — settings sections/defaults/projection/getters, the `snapshot` slot, representation-scope generations, `app-localization`, and the RUM client identity.
- `@kobato/assets` — the site-owned asset-URL path grammar, image kind/URL derivation, and the font payload types.
- `@kobato/lexical` — the Lexical document model: storage schemas, the save pipeline, React-free host-card specs, and their Tailwind entry.
- `@kobato/sanitize` — the isomorphic DOMPurify stack (per-strategy allowlists, parity-pinned engines) and `sanitize-url`.
- `@kobato/contracts` — the wire: per-domain Zod schemas + derived DTOs, `api-error`, `merge-patch`, SEA asset keys, warmup constants, and the remaining cross-boundary type shapes.
- `@kobato/seo` — `meta` / `og-image` builders over the root loader's matches.

Each leaf has its own AGENTS.md (owner, allowed deps, key interfaces/bans, test locations). Dependency direction: `@kobato/i18n` / `@kobato/assets` / `@kobato/sanitize` are leaves; `utils` → i18n; `cache` → i18n + utils; `lexical` → inkling headless + assets + sanitize + utils; `settings` → i18n + cache + utils (never contracts); `contracts` → settings + i18n + utils + lexical + assets + cache; `seo` → settings + i18n + utils. Pinned by `apps/kobato/tests/arch/package-dag.test.ts`.

## Client API usage

UI calls `orpc.<domain>.<resource>.<verb>(flatInput)` — single flat input, no `{ body, query, params }` buckets; the `@kobato/contracts` schema validates that input server-side. Errors reach the client as `ORPCError('CODE', { message })` rejections.
