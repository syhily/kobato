# Kobato app — the workspace SPA and the backend

`apps/kobato` (package name `kobato`) is the kobato deployable (ADR-0009, ADR-0012 §2): one app holding the backend —
the `@kobato/server` Hono app that `src/server.ts` boots through `startKobato`, carrying the `/rpc/*` oRPC transport —
and the workspace it serves under `/admin/*` and `/editor/*`: the admin, editor, and auth single-page application as a
React Router 8 **SPA** project (`react-router.config.ts` — `appDirectory: 'src'`, `ssr: false`,
`routeDiscovery: { mode: 'initial' }`) whose build is a static client tree under the `/admin/` base. The two halves
share one package because they only ever ship together: the backend finds the workspace build beside its own bundle,
never through a package name and never through the working directory. The feeds, the sitemap, robots.txt,
manifest.webmanifest, and the `/tags` + `/search` 301s are sayaka's, and every public resource (images, storage,
embedded fonts, branding assets, the Webmention receive, the RUM intake) is a `public.*` procedure pair that sayaka
serves. The public site lives in `apps/sayaka` and reaches kobato over oRPC and the two forwarded path families; it
imports nothing from this app. Backend in `@kobato/server`, contracts in `@kobato/api`, the shared leaves in
`packages/shared`. `apps/kobato/package.json` is the version source of truth for every package and for the `__APP_*__`
build globals of both the backend bundle and the workspace build.

## The backend entry

- `src/server.ts` — the backend entry: it calls `startKobato` (`@kobato/server/bootstrap/start-kobato`) with the
  workspace build's location and, in production, lets the package bind the listener or, under Vite, hands over the dev
  server's `httpServer`, and default-exports the app; it carries no `import.meta.hot.accept()` — the dev host loads this
  graph through `ssrLoadModule`, whose runner has `hmr: false`, so an HMR boundary here would be dead code (pinned by
  `tests/arch/server-public-surface.test.ts`). The boot sequence and the workspace-serving app (middleware pipeline +
  `/admin/assets/*` statics + shell documents + 404) live in `@kobato/server` (`bootstrap/start-kobato`,
  `http/kobato-app`, `http/spa-shell`) — nothing of it is here.
- `src/server/` — what only the app knows: `client-assets-root` (`clientAssetsRoot()` — under the kobato SEA binary it
  resolves the assets from the VFS `client/` prefix; on disk it resolves `build/workspace/client` relative to its own
  `import.meta.dirname`, so the answer is right from `src/server/` in dev and from `build/server/index.js` in the
  bundle, whatever the working directory) and `dev-server-ref` (reads the Vite dev server from the `globalThis` slot in
  dev). These two modules and `src/server.ts` are the app's only server-side modules.
- `vite.backend.config.ts` — the backend's Vite project, one config for both of its faces, chosen by `command`: on
  `serve` it is the backend dev host — a Vite SSR server (`appType: 'custom'`, port 4320) whose only plugin is
  `honoDevHost` (`@kobato/pack/vite/hono-dev-host`), loading `src/server.ts` and serving its default export for every
  request outside Vite's own paths. The plugin publishes the Vite dev server on the `globalThis` slot before the entry
  evaluates, so `startKobato` adopts its `httpServer` as the lifecycle's server instead of binding a port; it marks the
  process as a dev host and removes Vite's `--config` / `-c` from `process.argv` — the server reads that flag for
  `kobato.config.json` (`@kobato/server/infra/config-arg`), so under the dev host the config comes from
  `KOBATO_CONFIG_FILE` or the cwd default. A server-side edit re-evaluates the invalidated modules and the entry on the
  NEXT request behind the dev-host run-once guards: the plugin contract lives in `tools/pack/AGENTS.md`, the run-once
  state store (`@kobato/server/infra/dev-host-state`) in `packages/server/src/infra/AGENTS.md`. On `build` the same file
  is the backend bundle: `src/server.ts` in, `build/server/index.js` out (chunks under `build/server/assets/`), with
  `processWorkerEntryPlugin` writing `build/server/process-worker.js` beside it.

## The workspace SPA

- `src/root.tsx`, `src/routes.ts` — the framework entry set (SPA mode prerenders `/__spa-fallback.html` through React
  Router's default entry, renamed to `index.html` by the build); `src/zod-config.ts` must be imported first, before any
  schema evaluates.
- `src/ui/` — the admin product layer: components, domain controllers, the page editor composition, and the admin style
  adapters in `ui/styles/`. See `src/ui/AGENTS.md` (+ `src/ui/settings/AGENTS.md`) for the layer contract. The oRPC
  client is typed by `ContractRouterClient<typeof apiContract>` from `@kobato/api` (reached through
  `@kobato/api/browser/client`); wire DTO shapes come from `@kobato/api/contracts`. Imports use `@/...` inside the tree
  and the sanctioned external specifiers (`@kobato/web-kit/...`, `@kobato/ui/...`, the shared leaves) — never
  `@kobato/catalog/seo` (route title/meta resolution lives in the app layer), never `@kobato/inkling` across packages.
  The intra-app feature graph is pinned by `ALLOWED_FEATURE_IMPORTS` in `tests/arch/admin-feature-graph.test.ts`:
  `ui/shared` is the reuse hub (never a dependent of a feature), every other cross-feature edge is an audited allowlist
  row.
- The client tree is browser-safe: everything under `src/` but `src/server.ts` and `src/server/*` imports no
  `@kobato/server`, no `@kobato/db`, and no `@/server` module, value or type (pinned for the whole client tree by
  `tests/arch/web-direction.test.ts`). The test tree is the one place the app reaches the backend beyond the entry:
  `@kobato/server` and `@kobato/db` are declared devDependencies for the tests that drive the real harnesses —
  `tests/it/` behind `@kobato/server`'s test harnesses, `tests/utils/setup/{unit,it}.ts` reset the analytics query
  executor through `@kobato/db/duckdb/query`, `tests/unit/lib/client-action-result.test.ts` pins `toClientActionResult`
  against the server's `authFlowMessage`, `tests/unit/ui/settings/general-locale-sync.test.tsx` and
  `tests/unit/ui/settings/observability/observability-form.test.tsx` replay the server's `mergeSectionPatch` behind the
  mocked settings commit, `tests/unit/ui/settings/mirror-preset-labels.test.ts` resolves the mirror-preset label keys
  through `createServerTranslator`.
- Legacy-regression bans (the admin UI): no `blog.config.ts` in this app, no `DEFAULT_SETTINGS` / `BlogConstants` /
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
- The workspace has no route warmup (ADR-0012 §2): no idle script, no manifest fetch, no `virtual:kobato-route-warmup`.
  The warmup manifest contract (`@kobato/base/distribution/warmup-manifest`), the inline idle script, and the Vite
  plugin that writes the manifest (`tools/pack/src/vite/route-warmup.ts`) belong to the public site (`apps/sayaka`).
- `src/styles/` — the workspace's one Tailwind entry; see `src/styles/AGENTS.md`.
- Imports: app source as `@/...`, app test helpers as `@tests/...`, product code through `@kobato/<package>/...` — never
  a relative specifier outside React Router's generated `./+types/*`. No `index.ts` barrels, no `export { X } from 'y'`
  re-exports.
- `drizzle-orm` is a tests-only devDependency (seed/assertion code); production source never imports it.

## Build & dev

- `pnpm -C apps/kobato build` = `react-router build && vite build --config vite.backend.config.ts`: the workspace build
  first — `build/workspace/client` (assets under `build/workspace/client/assets`, referenced as `/admin/assets/*`;
  prerendered SPA fallback renamed `index.html`) plus the prerender-only server build under `build/workspace/server`
  (React Router's `buildDirectory`) — then the backend bundle into `build/server`. Neither build writes into the other's
  directory: the workspace empties `build/workspace`, the backend empties `build/server`. The root `pnpm run build` runs
  this app's build, then sayaka's. No product code resolves the client build through the working directory: the backend
  (`src/server/client-assets-root.ts`) and the SEA asset collection (`tools/pack/src/sea/paths.ts` →
  `workspaceClientBuildDir()`, anchored on the repository root) are the only readers. The production bundle guard
  (`tests/arch/production-rum-bundle.test.ts`) is an architecture test and locates the build from the repository root,
  like every arch test.
- `pnpm dev` (root) runs the backend on `127.0.0.1:4320` (`vite apps/kobato --config apps/kobato/vite.backend.config.ts`
  from the repository root): `/rpc/*`, `/health`, and `/ready` answer here. The workspace dev server
  (`pnpm dev:admin`, 4321) proxies those three path families to this port, so a browser never talks to 4320 directly; a
  `/admin/*` document requested on 4320 is answered by `startKobato`'s shell handler from whatever
  `build/workspace/client` the app holds (500 when it has never been built) — the dev-middleware documents live on the
  workspace's own origin.
- `pnpm dev:admin` (root) = `pnpm -C apps/kobato dev:admin`: the workspace on `127.0.0.1:4321`
  (`react-router dev apps/kobato` from the repository root), proxying `/rpc`, `/health`, and `/ready` to the backend dev
  server: `KOBATO_DEV_BACKEND_URL` (default `http://127.0.0.1:4320`, the `pnpm dev` backend) names the target. A
  dev-only pre-middleware rewrites `/editor/*` → `/admin/editor/*` so Vite's base middleware lets them through. The
  workspace never boots the Hono app: every procedure call leaves the browser for the backend through the proxy, and
  sayaka's dev server (`pnpm dev:public`) points at this origin so both `/admin/*` and `/rpc/*` work through it. Both
  dev scripts take the Vite CLI passthrough flags (`--host`, `--port`, `--strictPort`, `--logLevel`), which is how the
  instance driver boots them on free ports (`tools/instance/src/dev-instance.ts`).
- `vite.config.ts` is one call to `frontEndConfig` (`@kobato/pack/vite/front-end-config`): port 4321, kobato's
  `__APP_*__` identity, the `/admin/` base, the `/editor` rewrite and `svgr` around the shared plugin list, the backend
  proxy, and the dev-server dependency pre-bundling. Vite `base: '/admin/'` prefixes every client asset URL
  (`/admin/assets/*`) while route URLs stay `/admin/...` and `/editor/...` — React Router's `basename` stays `/` and is
  independent of Vite's `base`.
- `pnpm -C apps/kobato typegen` (`react-router typegen apps/kobato`) writes the route types under `.react-router/types`;
  `pnpm run lint` and the pre-commit hook run it first.
- `pnpm start` runs `node ./apps/kobato/build/server/index.js` — the backend bundle, which finds the workspace build
  beside itself from any working directory. `pnpm run sea:build` (root) turns the same outputs into the
  `dist-sea/kobato` SEA binary, which serves `/admin/assets/*` (the shell's `index.html` included) out of its embedded
  VFS `client/` prefix — the asset collection (`tools/pack/src/sea/assets.ts`) reads
  `apps/kobato/build/workspace/client` from the repository root.
- `tests/` — `arch/`, `unit/`, `snaps/`, `it/`, `browser/`, `e2e/`; see `tests/AGENTS.md`.

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
  (`useDocumentClock`, `useDocumentCsrfToken` behind the kit's `useLogout` and the workspace's `AdminInstallForm` /
  `BackupView`, `useKobatoInklingLabels`) and the fonts controller (`ui/fonts/font-slots.ts`, through the shell's fonts
  settings context) read the shell's document facts. The shell is static: no nonce props (`Scripts` /
  `ScrollRestoration` run without one — the shell handler injects the nonce into every inline script), no
  loader-data-dependent preload links. The root `HydrateFallback` is the branded splash prerendered into the SPA
  fallback document.
