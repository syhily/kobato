# Kobato app

`apps/kobato` is the backend deployable (ADR-0009): a React Router 8 **SPA** (`appDirectory: 'src'`, `ssr: false`)
served by its own Hono app, carrying the `admin/`, `editor/`, and `auth/` workspace and the `/rpc/*` oRPC transport —
the feeds, the sitemap, robots.txt, manifest.webmanifest, and the `/tags` + `/search` 301s are sayaka's, and every
public resource (images, storage, embedded fonts, branding assets, the Webmention receive, the RUM intake) is a
`public.*` procedure pair that sayaka serves. The public site lives in `apps/sayaka` and reaches kobato over oRPC and
the two forwarded path families. kobato wires routes to product code and owns the workspace admin UI in `src/ui/` (the
former `@kobato/web-admin` package, absorbed per ADR-0009); cross-surface features that call a procedure stay in
`@kobato/web-kit` (their UI-free data hooks, `use-notifications`, in `@kobato/api/browser`), primitives, the document
shell, and the shared document modules in `@kobato/ui`, backend in `@kobato/server`, contracts in `@kobato/api`. The
browser runtime under `src/document/` and `src/route-warmup/` is consumed by this app alone — nothing outside
`apps/kobato` imports it.

- `src/root.tsx`, `src/routes.ts`, `src/server.ts` — the framework entry set (`src/entry.server.tsx` is gone: SPA mode
  prerenders `/__spa-fallback.html` through React Router's default entry, renamed to `index.html` by the build);
  `src/zod-config.ts` must be imported first, before any schema evaluates.
- Client code (`routes`, `ui`, `root.tsx`, `src/{lib,document,route-warmup,seo}`) imports NO `@kobato/server` — every
  backend call goes through the `orpc` singleton (`@kobato/api/browser/client`); pinned by
  `tests/arch/route-server-surface.test.ts`.
- `src/ui/` — the admin product layer: components, domain controllers, the page editor composition, and the admin style
  adapters in `ui/styles/`. See `src/ui/AGENTS.md` (+ `src/ui/settings/AGENTS.md`) for the layer contract. Production
  sources there are browser-safe: no `node:*` value imports and no `@kobato/server` imports (value or type). The oRPC
  client is typed by `ContractRouterClient<typeof apiContract>` from `@kobato/api` (reached through
  `@kobato/api/browser/client`); wire DTO shapes come from `@kobato/api/contracts`. Imports use `@/ui/...` inside the
  tree and the sanctioned external specifiers (`@kobato/web-kit/...`, `@kobato/ui/...`, the shared leaves) — never the
  sayaka app (`@sayaka/*`), never `@kobato/catalog/seo` (route title/meta resolution lives in the app layer), never
  `@kobato/inkling` across packages. The intra-package feature graph is pinned by `ALLOWED_FEATURE_IMPORTS` in
  `tests/arch/admin-feature-graph.test.ts`: `ui/shared` is the reuse hub (never a dependent of a feature), every other
  cross-feature edge is an audited allowlist row.
- Legacy-regression bans (the admin UI): no `apps/kobato/src/blog.config.ts`, no `DEFAULT_SETTINGS` / `BlogConstants` /
  per-section "reset to defaults" actions / monolithic `BlogConfigContext` (settings UI uses per-section hooks), no
  `data-admin-shell` selector, no `@/ui/ui/shadcn/components/ui/` nesting.
- `src/lib/` — client code shared by every loader/action: `root-bootstrap` (the one-per-document
  `public.content.bootstrap` singleton through the in-flight memo — requested with `scope: 'workspace'` so the admin SPA
  receives its full message catalog, `requireRoleFromBootstrap` guard), `client-action-result` (`toClientActionResult`,
  `authErrorPayload` / `authMessagePayload`, `clientAuthFlowError`, `isCsrfFailure`), `guard-loader`
  (`guardLoader('<role>')`), `orpc-error` (`isOrpcErrorWithCode`), `route-status` (`notFound()` — React Router 8 has no
  `notFound` export).
- `src/server/` — the SPA-era Hono app: `spa-shell` (the pure nonce-CSP document handler for `/__spa-fallback.html`),
  `backend-server` (`createBackendServer` — middleware pipeline + `/admin/assets/*` statics + shell documents + 404;
  under the kobato SEA binary `clientAssetsRoot()` resolves the assets from the VFS `client/` prefix, on disk from
  `build/client`), `dev-server-ref` (reads the Vite dev server from the `globalThis` slot in dev).
- `src/seo/` — the typed route-meta factory over `@kobato/catalog/seo` builders (app-owned because it feeds the `meta`
  route export).
- `src/document/` — document-level behavior mounted once by the root: `use-chunk-error-recovery`, `use-ios-no-zoom`, and
  `document-facts` (`documentFactsFrom`, the root loader data → `DocumentFacts` mapping the root `Layout` hands the
  document shell).
- `src/route-warmup/` — `RouteWarmupScript` renders the inline idle-preload script; the manifest contract lives in
  `@kobato/distribution/warmup-manifest`, wire constants in `@kobato/distribution/route-warmup`. `use-route-warmup` is
  mounted by the root `App` (fetches `/admin/assets/warmup-manifest.json` once per document, tier 1 at root-data time,
  the role's tier 2 through the idle loader — production only; dev returns early).
- `src/styles/` — the app's one Tailwind entry; see `src/styles/AGENTS.md`.
- `tests/` — `arch/`, `unit/`, `it/`, `snaps/`, `browser/`, `e2e/`; see `tests/AGENTS.md`.
- Imports: `@/...` app source, `@tests/...` app test helpers, `@kobato/<package>/...` product code. No relative
  specifiers outside the documented exceptions (root `AGENTS.md`).
- `drizzle-orm` is a tests-only devDependency (seed/assertion code); production source never imports it.

## Build & dev

- `pnpm -C apps/kobato build` = `react-router build && vite build --config vite.backend.config.ts`: the first builds the
  client (assets under `build/client`, prerendered SPA fallback renamed `index.html`) plus the prerender-only server
  build; the second overwrites `build/server/index.js` with the backend bundle (`src/server.ts`).
- Vite `base: '/admin/'` prefixes every client asset URL (`/admin/assets/*`) while route URLs stay `/admin/...` and
  `/editor/...` — React Router's `basename` stays `/` and is independent of Vite's `base`.
- `pnpm dev` runs Vite on 4321; the shared `reactRouterHonoServer` plugin hands `/rpc/*`, `/health`, and the resource
  routes to the Hono app and excludes `/admin/*` + `/editor/*` documents (plus `.data`) so React Router's dev middleware
  serves them; a dev-only pre-middleware rewrites `/editor/*` → `/admin/editor/*` so Vite's base middleware lets them
  through.
- `pnpm start` runs `node ./apps/kobato/build/server/index.js` — the backend bundle. `pnpm run sea:build` (root) turns
  the same outputs into the `dist-sea/kobato` SEA binary, which serves `/admin/assets/*` (the shell's `index.html`
  included) out of its embedded VFS `client/` prefix.

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
- `RouteWarmupScript` imports the virtual module `virtual:kobato-route-warmup`, declared in
  `src/route-warmup/compiled-script.d.ts` and resolved by `routeWarmupPlugin` (`tools/pack/src/vite/route-warmup.ts`,
  invoked from `vite.config.ts` with the workspace tiers: tier-1 `root` + the admin landing, tier-2
  `routes/admin|editor|auth/` — no public tier). Empty in dev, the bundled idle loader in a production build. The id
  must stay unresolvable to a real file — a file behind that import resolves first and silently disables the inline
  script. That idle loader is the one non-React script in the app.
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
