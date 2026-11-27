# Workspace conventions (`@kobato/web-admin`)

`packages/web/admin` (`@kobato/web-admin`) is the workspace: the admin, editor, and auth single-page application as a
React Router 8 **SPA** project (`react-router.config.ts` — `appDirectory: 'src'`, `ssr: false`,
`routeDiscovery: { mode: 'initial' }`) whose build is a static client tree under the `/admin/` base (ADR-0011 §4). It
lives under `packages/` because it is not deployed on its own: kobato (`apps/kobato`) builds and serves it under
`/admin/*` + `/editor/*`, locating the build through this package (`clientAssetsRoot()` resolves
`@kobato/web-admin/package.json`; the SEA asset collection does the same from `tools/pack`), and sayaka forwards the two
path families. Its production sources import `@kobato/ui`, `@kobato/web-kit`, `@kobato/api`, `@kobato/inkling`, and the
shared leaves — never `@kobato/server` (value or type), never `@kobato/db`, and never the sayaka app (`@sayaka/*`); the
test-only exception is under `tests/`.

- `src/root.tsx`, `src/routes.ts` — the framework entry set (`src/entry.server.tsx` is gone: SPA mode prerenders
  `/__spa-fallback.html` through React Router's default entry, renamed to `index.html` by the build);
  `src/zod-config.ts` must be imported first, before any schema evaluates.
- `src/ui/` — the admin product layer: components, domain controllers, the page editor composition, and the admin style
  adapters in `ui/styles/`. See `src/ui/AGENTS.md` (+ `src/ui/settings/AGENTS.md`) for the layer contract. Production
  sources there are browser-safe: no `node:*` value imports and no `@kobato/server` imports (value or type; pinned for
  the whole client tree by `tests/arch/route-server-surface.test.ts`). The oRPC client is typed by
  `ContractRouterClient<typeof apiContract>` from `@kobato/api` (reached through `@kobato/api/browser/client`); wire DTO
  shapes come from `@kobato/api/contracts`. Imports use `@kobato/web-admin/...` inside the tree and the sanctioned
  external specifiers (`@kobato/web-kit/...`, `@kobato/ui/...`, the shared leaves) — never `@kobato/catalog/seo` (route
  title/meta resolution lives in the app layer), never `@kobato/inkling` across packages. The intra-package feature
  graph is pinned by `ALLOWED_FEATURE_IMPORTS` in `tests/arch/admin-feature-graph.test.ts`: `ui/shared` is the reuse hub
  (never a dependent of a feature), every other cross-feature edge is an audited allowlist row.
- Legacy-regression bans (the admin UI): no `blog.config.ts` in this package, no `DEFAULT_SETTINGS` / `BlogConstants` /
  per-section "reset to defaults" actions / monolithic `BlogConfigContext` (settings UI uses per-section hooks), no
  `data-admin-shell` selector, no `ui/ui/shadcn/components/ui/` nesting.
- `src/lib/` — client code shared by every loader/action: `root-bootstrap` (the one-per-document
  `public.content.bootstrap` singleton through the in-flight memo — requested with `scope: 'workspace'` so the admin SPA
  receives its full message catalog, `requireRoleFromBootstrap` guard), `client-action-result` (`toClientActionResult`,
  `authErrorPayload` / `authMessagePayload`, `clientAuthFlowError`, `isCsrfFailure`), `guard-loader`
  (`guardLoader('<role>')`), `orpc-error` (`isOrpcErrorWithCode`), `route-status` (`notFound()` — React Router 8 has no
  `notFound` export).
- `src/seo/` — the typed route-meta factory over `@kobato/catalog/seo` builders (app-owned because it feeds the `meta`
  route export).
- `src/document/` — document-level behavior mounted once by the root: `use-chunk-error-recovery`, `use-ios-no-zoom`, and
  `document-facts` (`documentFactsFrom`, the root loader data → `DocumentFacts` mapping the root `Layout` hands the
  document shell).
- The workspace has no route warmup (ADR-0011 §4): no idle script, no manifest fetch, no `virtual:kobato-route-warmup`.
  The warmup manifest contract (`@kobato/base/distribution/warmup-manifest`), the inline idle script, and the Vite
  plugin that writes the manifest (`tools/pack/src/vite/route-warmup.ts`) belong to the public site (`apps/sayaka`).
- `src/styles/` — the workspace's one Tailwind entry; see `src/styles/AGENTS.md`.
- Imports: the package imports itself through `@kobato/web-admin/<path>` (source) and `@kobato/web-admin/tests/<path>`
  (test helpers), as the kit does — never a relative specifier outside React Router's generated `./+types/*`; product
  code through `@kobato/<package>/...`. No `index.ts` barrels, no `export { X } from 'y'` re-exports.
- `tests/` — `arch/` (workspace-only pins), `unit/`, and `snaps/` mirror `src/`; `tests/utils/` holds the helpers
  (`analytics-state`, `dialog`, `settings-mutation-mock`) and the setup wrappers under `tests/utils/setup/`. The
  cross-package pins (package DAG, client bundle, tailwind compile/source ownership, i18n literals, the Vitest project
  registry) stay in `apps/kobato/tests/arch`. Vitest trees import the canonical product helpers cross-package (the SSR
  render helper from `@kobato/web-kit/tests/utils/render.tsx`, i18n render from
  `@kobato/ui/tests/utils/{i18n-render,hook}.tsx`, the `DocumentFacts` fixture from
  `@kobato/ui/tests/utils/document-facts.ts` for tests that mount their own stack); React Router's `./+types/*` stays
  relative.
- The test tree is the one place the workspace reaches the backend: `@kobato/server` and `@kobato/db` are declared
  devDependencies for five files and nothing else imports them. `tests/utils/setup/unit.ts` resets the analytics query
  executor through `@kobato/db/duckdb/query`; `tests/unit/lib/client-action-result.test.ts` pins `toClientActionResult`
  against the server's `authFlowMessage`; `tests/unit/ui/settings/general-locale-sync.test.tsx` and
  `tests/unit/ui/settings/observability/observability-form.test.tsx` replay the server's `mergeSectionPatch` behind the
  mocked settings commit; `tests/unit/ui/settings/mirror-preset-labels.test.ts` resolves the mirror-preset label keys
  through `createServerTranslator`. Production `src/` imports neither package (value or type) — pinned by
  `tests/arch/route-server-surface.test.ts` and by the workspace's src targets in
  `apps/kobato/tests/arch/package-dag.test.ts`, which admit both only as declared test dependencies.

## Build & dev

- `pnpm -C packages/web/admin build` = `react-router build`: `build/client` (assets under `build/client/assets`,
  referenced as `/admin/assets/*`; prerendered SPA fallback renamed `index.html`) plus the prerender-only server build
  under `build/server`. The root `pnpm run build` runs it before the backend bundle. No product code resolves
  `build/client` through the working directory: the backend (`apps/kobato/src/server/client-assets-root.ts`) and the SEA
  asset collection (`tools/pack/src/sea/paths.ts` → `adminClientBuildDir()`) go through the package. The production
  bundle guard (`apps/kobato/tests/arch/production-rum-bundle.test.ts`) is an architecture test and locates the build
  from the repository root, like every arch test. `vite.config.ts` is one call to `frontEndConfig`
  (`@kobato/pack/vite/front-end-config`): port 4321, kobato's `__APP_*__` identity, the `/admin/` base, the `/editor`
  rewrite and `svgr` around the shared plugin list, the backend proxy, and the dev-server dependency pre-bundling.
- Vite `base: '/admin/'` prefixes every client asset URL (`/admin/assets/*`) while route URLs stay `/admin/...` and
  `/editor/...` — React Router's `basename` stays `/` and is independent of Vite's `base`.
- `pnpm dev:admin` (root) runs the workspace on `127.0.0.1:4321` (`react-router dev packages/web/admin` from the
  repository root) and proxies `/rpc`, `/health`, and `/ready` to the backend dev server: `KOBATO_DEV_BACKEND_URL`
  (default `http://127.0.0.1:4320`, the `pnpm dev` backend) names the target. A dev-only pre-middleware rewrites
  `/editor/*` → `/admin/editor/*` so Vite's base middleware lets them through. The workspace never boots the Hono app:
  every procedure call leaves the browser for the backend through the proxy, and sayaka's dev server (`pnpm dev:public`)
  points at this origin so both `/admin/*` and `/rpc/*` work through it.

## Document runtime

- Document-level hooks mount once per document — never per form or per route component that can render more than once.
- iOS auto-zoom: iOS Safari zooms when focusing a control with `font-size < 16px`; rewriting the viewport `<meta>` from
  `focusin` is too late. The lock is refcounted in `@kobato/inkling/comment/viewport-zoom-lock` (iOS/iPadOS WebKit
  only): every focus-ending activation holds the lock BEFORE focus lands. `useIosNoZoomOnFocus()` is mounted once at the
  top of the root `App`; the comment composer's activation handoff holds the same lock. Do NOT re-install the hook
  per-form and do NOT rewrite the viewport `<meta>` anywhere else.
- Chunk-error recovery: `use-chunk-error-recovery` and `useReloadOnChunkError` call `triggerChunkReload` from
  `@kobato/ui/lib/chunk-reload`, the reload store `@kobato/ui`'s `ChunkReloadOverlay` (rendered by the document shell)
  subscribes to.
- The root `Layout` renders `@kobato/ui`'s `DocumentShell` — the document element, head (language, theme class, font
  variables and links, preconnects), `I18nProvider`, and `ChunkReloadOverlay` — over `DocumentFacts` mapped from the
  root loader data by `documentFactsFrom` (`src/document/document-facts.ts`); it fills the `head` slot with `Meta` +
  `Links` and the `bodyEnd` slot with `ScrollRestoration` + `Scripts`. The root `App` mounts `@kobato/ui`'s
  `DocumentProviders` (theme → settings → lazy motion → locale sync) inside `QueryClientProvider`; the workspace hooks
  that used to read the root loader (`useDocumentClock`, `useDocumentCsrfToken` behind the kit's `useLogout` and the
  workspace's `AdminInstallForm` / `BackupView`, `useKobatoInklingLabels`) and the fonts controller
  (`ui/fonts/font-slots.ts`, through the shell's fonts settings context) now read the shell's document facts. The shell
  is static: no nonce props (`Scripts` / `ScrollRestoration` run without one — the shell handler injects the nonce into
  every inline script), no loader-data-dependent preload links. The root `HydrateFallback` is the branded splash
  prerendered into the SPA fallback document.
