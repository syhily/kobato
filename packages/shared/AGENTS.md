# Shared umbrella conventions

`packages/shared/` is an umbrella of nine workspace leaf packages (`packages/shared/<name>` ↔ `@kobato/<name>`), not a
package: no umbrella package.json, test directory, barrel, or way to import "shared" as one unit. Its test projects
(`shared-unit`, `shared-snaps`) are defined in `tools/test/src/projects/`.

## Umbrella rules (every leaf)

- **Runtime-isomorphic, React-free.** No `node:*` value imports, no DOM-only APIs, no direct `process.env`, no
  `console.*`, no React (components, hooks, JSX, or `react`/`react-dom` value OR type imports) —
  `apps/kobato/tests/arch/shared-react-free.test.ts`. The one sanctioned node dependency is `@kobato/sanitize`'s
  `engine.node.ts` (jsdom), swapped to `engine.browser.ts` in the client bundle.
- **Junk-drawer guard.** A module lands in a leaf only with a REAL cross-package consumer (two or more product packages)
  or inside that leaf's already-cohesive family. A single-consumer module belongs to that consumer.
- **Direct source imports, no barrels.** Consumers import `@kobato/<leaf>/<module>.ts`; no re-exports, no leaf-level
  `index.ts`.
- **Error handling.** No logger here: throw, and let the boundary catch and log.

## The nine leaves

`utils` (pure isomorphic helpers + display `format`), `auth` (role vocabulary, password/Web Crypto primitives, network
SSRF/CIDR + passkey RP checks), `i18n` (locale contract, ICU catalogs, `catalog-scope`, `fallback-messages`,
`inkling-labels`), `cache` (bucket declaration registry — never a storage plane), `catalog` (public content read model +
projections, `seo/`), `settings` (Section schema/default/secret registry, admin projections, `snapshot` slot,
representation scopes, RUM client identity, `telemetry/`), `assets` (asset-URL grammar, image kinds, avatar rule,
Gravatar mirror), `sanitize` (isomorphic DOMPurify stack, `escape-html`), `distribution` (`__APP_*__` identity, SEA
asset keys, route-warmup manifest contract). Wire vocabulary (per-domain Zod schemas + DTOs) lives in
`@kobato/api/contracts`.

Dependency direction: `utils` → i18n; `auth` → i18n; `catalog` → settings + i18n + utils + inkling headless (type-only);
`cache` → i18n + utils; `settings` → i18n + cache + assets + utils (never `@kobato/api`). Pinned by
`apps/kobato/tests/arch/package-dag.test.ts`.

## Client API usage

UI calls `orpc.<group>.<domain>.<resource>.<verb>(flatInput)` (`group` is `public` / `account` / `admin`) — single flat
input, no `{ body, query, params }` buckets; errors arrive as `ORPCError('CODE', { message })` rejections.
