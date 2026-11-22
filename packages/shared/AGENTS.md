# Shared umbrella conventions

`packages/shared/` is not a package: it is an umbrella of nine workspace leaf packages (`packages/shared/<name>` ↔
`@kobato/<name>`). There is deliberately no umbrella package.json, test directory, barrel, or way to import "shared" as
one unit. The `shared-unit` and `shared-snaps` project definitions live in `tools/test/src/projects/`.

## Umbrella rules (every leaf)

- **Runtime-isomorphic, React-free.** No `node:*` value imports, no DOM-only APIs, no direct `process.env`, no
  `console.*`, no React — no components, hooks, JSX, or `react`/`react-dom` value OR type imports
  (`apps/kobato/tests/arch/shared-react-free.test.ts`). The one sanctioned node dependency is `@kobato/sanitize`'s
  `engine.node.ts` (jsdom), swapped to `engine.browser.ts` in the client bundle by the `sanitize-html-engine-alias` vite
  plugin.
- **Junk-drawer guard.** A new module lands in a leaf only with a REAL cross-package consumer (two or more product
  packages) or inside that leaf's already-cohesive family. A single-consumer module belongs to that consumer;
  "isomorphic-safe" or "could be shared someday" is not a reason.
- **Direct source imports, no barrels.** Consumers import `@kobato/<leaf>/<module>.ts` from the source file; no
  re-exports, no leaf-level `index.ts`.
- **Error handling.** No logger here (server and client bring their own): throw, and let the boundary catch and log.

## The nine leaves

`utils` (pure isomorphic helpers + display `format`), `auth` (role vocabulary, password/Web Crypto primitives, `network`
SSRF/CIDR + passkey RP checks), `i18n` (locale contract, ICU catalogs, `catalog-scope`, `fallback-messages`,
`inkling-labels`), `cache` (bucket declaration registry — never a storage plane), `catalog` (public content read model +
projections, plus the `seo/` presentation-metadata layer), `settings` (Section schema/default/secret registry, admin
projections, `snapshot` slot, representation scopes, RUM client identity, and the `telemetry/` observability protocol
layer — RUM vocabulary, bootstrap/intake, OpenObserve stream/metric names, privacy-pipeline identity; server-only write
validation stays in server), `assets` (asset-URL grammar, image kinds, avatar rule, Gravatar mirror, code-block
highlight languages), `sanitize` (isomorphic DOMPurify stack, `sanitize-url`, `escape-html`), `distribution`
(`__APP_*__` identity, SEA asset keys, route-warmup manifest contract). The wire vocabulary (per-domain Zod schemas +
DTOs, `api-error`, `merge-patch`) lives in the API SDK: `@kobato/api/contracts`.

Dependency direction: `utils` → i18n; `auth` → i18n; `catalog` → settings + i18n + utils + inkling headless (type-only);
`cache` → i18n + utils; `settings` → i18n + cache + assets + utils (never `@kobato/api`). Pinned by
`apps/kobato/tests/arch/package-dag.test.ts`.

## Client API usage

UI calls `orpc.<group>.<domain>.<resource>.<verb>(flatInput)` (`group` is `public` / `account` / `admin`) — single flat
input, no `{ body, query, params }` buckets; errors reach the client as `ORPCError('CODE', { message })` rejections.
