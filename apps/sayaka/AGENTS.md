# Sayaka conventions

`apps/sayaka` (package name `sayaka`) is the server-rendered public frontend of Kobato (ADR-0009): a React Router 8
framework-mode SSR app (`appDirectory: 'src'`, `ssr: true`) that serves every public route of the site — home and
paginated listings, archives, categories, category/tag/search listings, post and page details, plus the feed, sitemap,
robots, manifest, and legacy-redirect resources — and owns the public document perimeter. It talks to a `kobato` backend
**over oRPC only** (`createKobatoServerClient` from `@kobato/api/client`) — it has no database, no settings store, no
domain logic.

## Contract

- Perimeter order (`src/server/perimeter.ts`): error handler → scheme fix → request id → pino request log → compress →
  document response headers (after `next()`) → cookie relay (after `next()`) → trailing-slash → WordPress decoy →
  forwarded families → the two inbound-protocol handlers (RUM intake, Webmention receive). Static assets (`/assets/*`)
  are served by the vendored Hono glue before this chain and fall through on a miss.
- One per-request context (`src/server/request-context.ts`):
  `{ cspNonce, client, responseHeaders, bundle, analyticsEventId, bootstrap }`, built by `buildLoadContext`, shared with
  the document-headers step and the cookie relay. `bootstrap()` is ONE memoized promise per document request (created
  lazily by whichever loader asks first): the root loader awaits it, applies the `noAdmin` 303 to NAVIGATIONS only
  (`isNavigationRequest` in `src/server/navigation-request.ts`: a request with no `Sec-Fetch-Dest` header — non-browser
  clients — or with `document`; sub-resource destinations such as `image`/`style`/`empty` continue to their resource
  route so the setup shell's branding answers pre-install), and stores `blogSettings` in `bundle`; leaf loaders await
  the same promise for backend facts — a 304's `Content-Language` comes from the bootstrap output's `i18n.locale`, never
  from the raw setting or a default. The cookie relay is the ONLY place kobato's `Set-Cookie` reaches the browser, and
  only on HTML documents: it appends the collected cookies when the response's `Content-Type` is `text/html` (parameters
  allowed), never on any other content type, so feeds, the sitemap, robots, and the manifest carry no cookie (forwarded
  `/rpc/*` responses are raw pass-through and keep kobato's own cookies). Leaf loaders fire their procedure call BEFORE
  awaiting `bootstrap()` (one round trip in flight); every such early promise is wrapped in `sinkUnhandledRejection`
  (`src/server/unwrap.ts`) because the root loader's `noAdmin` 303 abandons in-flight sibling loaders — kobato's install
  gate 303s the leaf call, and an unguarded rejection would crash the process.
- Analytics event id: sayaka mints one UUID per document request (`analyticsEventId`), sends it on every oRPC call as
  `X-Kobato-Analytics-Event` (constant `ANALYTICS_EVENT_HEADER` in `@kobato/api/client/analytics-event`), and returns it
  in loader data as `eid` — kobato's `extractRequestFacts` adopts it when syntactically a UUID, so the server-side page
  view and the browser's device-environment beacon share one join key.
- Forwarding (`src/server/forward.ts`) is FINAL (ADR-0009 §9): `/rpc/*`, `/admin/*`, `/editor/*` proxy to kobato with
  streamed bodies, `redirect: 'manual'`, inbound spoofable proxy headers dropped and re-derived (`X-Forwarded-For` from
  sayaka's own visitor address, `X-Forwarded-Proto` from the scheme-fixed request URL; every `x-forwarded-*` inbound
  header is dropped by prefix), hop-by-hop headers stripped both directions. The upstream fetch is bounded by the same
  response-header timeout as the API client — `requestTimeoutMsForUrl` over `SAYAKA_KOBATO_TIMEOUT_MS` (default 30 s,
  `src/server/config.ts`), released once kobato's headers arrive so streamed bodies stay unbounded, raised to a
  forwarded procedure's declared `requestTimeoutMs` metadata when larger (the 30-minute restore procedures) — and a
  timeout answers `504` `Gateway Timeout` plain text where an unreachable upstream answers `502`. The upstream request
  asks for `accept-encoding: identity`, and the upstream `content-encoding` / `content-length` headers are dropped as a
  safety net: sayaka's own `compress()` is the only encoder on the path, and a body the fetch client decoded must never
  be forwarded under a stale encoding label. No other request ever reaches kobato as a forwarded pass-through
  (`tests/arch/public-surface.test.ts` pins the family list and the absence of any second forwarding module).
- Scheme fix (`src/server/scheme-fix.ts`) trusts `X-Forwarded-Proto` / `Forwarded: proto=` only from loopback or
  `SAYAKA_TRUSTED_PROXIES` peers. Address headers (`visitor-address.ts`) use the same gate as kobato's
  `getClientAddress`: a loopback peer IS trusted (the same-host reverse-proxy topology), otherwise the peer must match
  `SAYAKA_TRUSTED_PROXIES`; untrusted peers are used verbatim and their headers ignored.
- Configuration lives entirely in `src/server/config.ts` (`SAYAKA_HOST`, `SAYAKA_PORT`, `SAYAKA_KOBATO_RPC_URL`,
  `SAYAKA_KOBATO_TIMEOUT_MS`, `SAYAKA_TRUSTED_PROXIES`; zod-validated, fail fast in production). No other sayaka module
  reads `process.env` (the vendored `src/server/hono/` glue excepted).
- Logging: `src/server/logger.ts` (pino; silent under test) plus `hono-pino` bindings carrying method, path, and request
  id only — never headers.
- Process lifecycle (`src/server/lifecycle.ts`, wired in `src/server.ts`): logs `unhandledRejection` through the pino
  logger and never crashes on one — React Router abandons in-flight loader promises when the root loader 303s and
  streamed detail extras can outlive their render. `SIGTERM` / `SIGINT` run a graceful shutdown: close the HTTP server
  captured through `createHonoServer`'s `onServe` (`setLifecycleHttpServer`), force-exit after 10 s.

## Invariants

- The public site's viewer interactions ride the promoted `publicContract` procedures only: `public.likes.*`,
  `public.friends.apply`, `public.notifications.*`, `public.newsletter.*`, and the signed-in own-comment writes
  (`public.comments.updateOwn` / `requestDeleteOwn` / `cancelDeleteOwn`). For signed-in workspace affordances rendered
  inside the public page — in-place comment moderation and the notifications drawer's compose/recall — sayaka and
  `@kobato/web-kit` reach a FROZEN set of `admin` procedures (ADR-0009 §2): `admin.comments.{approve,edit,delete}`,
  `admin.notifications.{sendDirect,sendBroadcast,recall}`, and `admin.users.list`. The set carries no external guarantee
  and cannot grow without a deliberate edit to its pin (`tests/arch/frozen-admin-set.test.ts`), which scans `src/**`,
  `packages/web/kit/src/**`, and the api browser hooks both import (`packages/api/src/browser/**`) and fails on any
  other `admin` touch.
- Never imports `@/...`, `@tests/...`, `@kobato/server/*`, `@kobato/db/*`, `@kobato/web-admin`, or anything under
  `apps/kobato` (the workspace is reached through the forwarded `/admin` perimeter, never imported); `src/` never
  imports `@kobato/pack` (vite.config may). Pinned by `apps/sayaka/tests/arch/import-boundary.test.ts`.
- Sayaka owns the public UI layer in `src/ui/**` (the former `@kobato/web-public` tree, dissolved and deleted per
  ADR-0009) and MAY import `@kobato/web-kit`; the public comment composer is Inkling's comment surface
  (`@kobato/inkling/comment/*`: `LazyCommentBodyEditor`, `CommentContentHtml`, `comment-body-helpers`, and the iOS
  viewport lock both apps' `useIosNoZoomOnFocus` hooks hold) — never the kit; the workspace is `@kobato/web-admin`
  (`packages/web/admin`) and the specifier stays banned by `apps/sayaka/tests/arch/import-boundary.test.ts`.
- The root `Layout` renders `@kobato/ui`'s `DocumentShell` over `DocumentFacts` mapped from the root loader data
  (`documentFactsFrom` in `src/document/document-facts.ts`): the shell owns the document element, head, fonts,
  preconnects, `I18nProvider`, and the chunk-reload overlay; the `head` slot carries `Meta` / `Links`, the webmention
  link, and the critical-chunk preloads, the `bodyEnd` slot `ScrollRestoration`, `Scripts`, and `RouteWarmupScript` with
  the CSP nonce. `App` mounts `@kobato/ui`'s `DocumentProviders` (theme → settings → lazy motion → locale sync) inside
  `QueryClientProvider`. Public modules read document facts (`Footer` / `Sidebar` via `useDocumentClock`, `UserMenu`'s
  `useLogout` via its CSRF token) from the shell — never through `useRouteLoaderData` (the public layout route's
  `currentUser` read in `src/routes/layout.tsx` is the one app-side exception).
- The two inbound protocols are perimeter handlers, not React Router routes, so raw-body POSTs keep their limits and
  status semantics without the document pipeline's root-loader bootstrap (`createRelayClient` in
  `src/server/relay-client.ts` builds the per-request server client; both handlers key kobato's rate limits on the
  forwarded visitor address):
  - `src/server/rum-intake.ts` answers `POST /api/rum/intake/*` — the one foreign protocol sayaka speaks (ADR-0009 §8).
    It sets `Cache-Control: no-store` on every answer, vetoes compressed batches (415), caps the read at 1 MiB (413,
    declared length checked before the read), and passes the raw track path, raw query string, body text, and content
    type to `public.observability.rumIntake`, re-emitting its envelope: 202 empty, `{error:{message}}` JSON for
    404/413/414/429/502 with the envelope's `Retry-After`. kobato keeps the relay gate, track validation, query cap,
    rate limit, token injection, and the upstream call.
  - `src/server/webmention-receive.ts` answers `POST /webmention`: the 16 KiB form cap
    (`{error:{message:'Payload too large'}}` 413), the parsed `source`/`target` handed to `public.webmentions.receive`,
    and the envelope re-emitted — accepted → 202 `{"status":"pending"}`, invalid/disabled → 400/410 `{error:{message}}`;
    decoded `ORPCError`s (unknown target 404, queue-full/IP 429) re-emit `{error:{code,message,descriptor}}`
    byte-identical to kobato's old onErrorHandler bodies.
- Every other former legacy family serves from sayaka itself: feeds, the sitemap, robots.txt, manifest.webmanifest, the
  `/tags` + `/search` 301s (pure local builders in `src/server/site-files.ts`), and — as procedure pairs — the branding
  assets (14 registered exact paths share `routes/branding-asset.ts` with unique route ids), OG images
  (`routes/images-og.ts`, `-category.ts`; the loader guards the `.png` suffix), calendar images
  (`routes/images-calendar.ts`, `-dark.ts`; the dark theme comes from the path segment), avatar images
  (`routes/images-avatar.ts`, `?s=` forwarded raw), embedded fonts (`routes/fonts-embedded.ts`, splat), and storage
  objects (`routes/storage.ts`, splat). The former `/assets/*` miss-fallback to kobato is GONE — kobato's workspace
  assets live inside the forwarded `/admin/*` family (`/admin/assets/*`) since the admin became an SPA.
- Resource routes (`src/routes/feed.ts`, `feed-atom.ts`, `category/feed*.ts`, `tag/feed*.ts`, `sitemap-xml.ts`,
  `robots-txt.ts`, `manifest-webmanifest.ts`, `tags.ts`, `search.ts`, `branding-asset.ts`, `images-*.ts`,
  `fonts-embedded.ts`, `storage.ts`) are registered OUTSIDE the public layout in `src/routes.ts`: a loader that returns
  the `Response`. They share the one wire-to-route adaptation beside the document one — `unwrapResource` in
  `src/server/unwrap.ts` (procedure signal → 200 with body/content type/ETag/Cache-Control/Content-Language,
  `not-modified` → 304 with the same header profile, `redirect` → 302 + Location + optional Cache-Control,
  `range-not-satisfiable` → 416 + Content-Range, `ORPCError('NOT_FOUND')` → 404, `BAD_REQUEST` → empty 400,
  `TOO_MANY_REQUESTS`/`SERVICE_UNAVAILABLE` → 429/503 with the localized text) — never a per-route copy. The `profile`
  option carries the family header constants kobato's perimeter used to add: `'binary'` sets
  `X-Content-Type-Options: nosniff`, `'media'` adds `Accept-Ranges: bytes` to the envelope cases (stream answers forward
  kobato's own headers verbatim). A streaming answer never buffers: the media routes call their procedure and read the
  transport capture the server client took — `takeResourceStream(procedure)` on the request context returns
  `{ status, headers, body }` from the `x-kobato-resource-stream`-marked RPC response, and the adaptation builds the
  browser `Response` from it directly (`new Response(captured.body, …)`, aborted with the inbound request's signal
  through the composed fetch signal). Every leaf procedure promise still goes through `sinkUnhandledRejection` (the root
  loader's `noAdmin` 303 abandons sibling loaders). The `ok` ETag is the strong procedure tag; sayaka's `compress()`
  weakens it on gzipped 200s exactly like kobato's perimeter did, so the wire is unchanged. A known change of the split:
  every resource request also runs the root loader's bootstrap call, so a non-browser client (no `Sec-Fetch-Dest`
  header) hitting an uninstalled instance 303s even `/robots.txt` or `/storage/*` to `/admin/setup` where kobato's
  install gate used to serve the image/font families — accepted, with no resource path table built for it. Browser
  sub-resources are the narrow exception: the root loader's 303 fires for navigations only (`isNavigationRequest`), and
  kobato's `branding.asset` procedure is `installGateExempt`, so the setup shell's branding (`/logo*.svg`, `/favicon.*`,
  `/apple-touch-icon.png`, the `/images/*.png` branding slots) answers 200 pre-install — the reachability kobato's old
  gate gave those URL prefixes; the font/storage families stay gated and answer an error status, not a redirect, when a
  sub-resource fetch races an uninstalled instance.
- `src/server/hono/` is the vendored `react-router-hono-server` glue (MIT, see its `LICENSE`): it imports sayaka's own
  config/logger, never `@kobato/server`. `clientAssetsRoot()` in `node.ts` is the one SEA seam: under the sayaka SEA
  binary it resolves `<vfs-root>/sayaka-client`, on disk `../client` beside the built server. The SEA runtime awareness
  sayaka needs lives in `src/server/sea.ts` (`node:sea` detection + the VFS root + the client-assets swap);
  `warmup-manifest.ts` reads its manifest through the same VFS root. The injected-entry side — the sequential
  `fs.readv`/`fs.writev` VFS patch and the `--version`/`--help` exit before the server graph — belongs to the SEA
  pipeline, not the app: `tools/pack/src/sea/sayaka-sea-cli.ts` + `tools/pack/src/sea/sayaka-sea-vfs-fs-patch.ts`,
  reached only by the injected main `tools/pack/src/sea/sayaka-entry.ts`, never imported from `src/` and never part of
  the node build (`@kobato/pack` stays a build-tooling devDependency only; pack does not depend on sayaka). The
  build-time dev plugin is NOT vendored here — it is `@kobato/pack/vite/react-router-hono-server` (sayaka's; the
  backend's Vite host uses `@kobato/pack/vite/hono-dev-host` beside it), which hands the Vite dev server to the app
  through a `globalThis` slot (`dev-server-ref.ts` reads it, dev only).
- No comments in source, no `any`/`as` (`@kobato/base/utils/unsafe-cast`), kebab-case modules, no barrels.

## Commands

- `pnpm dev:public` (root) — dev server on 4322; it forwards to the workspace origin on 4321 by default
  (`pnpm dev:admin`, which proxies `/rpc/*` to the backend on 4320) or straight to the backend through
  `SAYAKA_KOBATO_RPC_URL`.
- `pnpm -C apps/sayaka build` / `node apps/sayaka/build/server/index.js` (needs `SAYAKA_KOBATO_RPC_URL`).
  `vite.config.ts` is one call to `frontEndConfig` (`@kobato/pack/vite/front-end-config`): port 4322, sayaka's own
  `__APP_*__` identity, the SSR server entry, the Hono dev host, and the route-warmup plugin around the shared plugin
  list.
- `pnpm run sea:build` (root) builds the sayaka SEA binary too: `dist-sea/sayaka` (+ `sayaka.sha256`) embeds
  `build/client/**` under the `sayaka-client/` VFS key and is covered by `pnpm run split:smoke --sea` together with
  `dist-sea/kobato`.
- `pnpm run split:smoke` — the two-process boot + perimeter smoke (`@kobato/test`'s instance driver); `--sea` runs it
  against the binaries.

## Live-instance suites

- `tests/e2e/` and `tests/browser/` hold the PUBLIC-site HTTP e2e and real-browser journeys moved here from
  `apps/kobato/tests` (ADR-0009): home/listings/details, the comment moderation flow, four-locale i18n, the public
  composer's locale-chunk loading, the cold-load popup journeys. Both run against the booted kobato+sayaka PAIR — the
  vitest e2e helpers live under `tests/e2e/` (plain `fetch` over `@kobato/test/instance/client/*`; admin RPC talks to
  kobato's origin, every public URL and viewer RPC goes through sayaka's origin) and the Playwright journeys import the
  SHARED journey support from `@kobato/test/browser/{fixtures,journey,settings-api}` — there is no per-tree `support/`
  copy. The Playwright config (`tools/test/playwright.config.ts`) runs two projects over one booted pair; `baseURL` is
  sayaka's origin, so the shared sign-in and staging helpers reach the admin through sayaka's forwarded `/admin/*` +
  `/rpc/*` families. Browser channel: bundled Chromium unless `KOBATO_BROWSER_CHANNEL` names another (set
  `KOBATO_BROWSER_CHANNEL=chrome` to drive the installed Google Chrome without downloading Playwright browsers).
- Neither tree is registered in the Vitest project table — not part of `pnpm test`. Run them through `pnpm run sea:e2e`
  / `pnpm run sea:browser` (built binaries, managed pair boot) or `pnpm run test:browser` against
  `KOBATO_BROWSER_BASE_URL` (sayaka's origin) with `KOBATO_BROWSER_ADMIN_EMAIL` / `KOBATO_BROWSER_ADMIN_PASSWORD`.
- Resource-route parity pins: `tests/unit/routes/feed.test.ts`, `sitemap-xml.test.ts`, `site-files.test.ts`,
  `images-og.test.ts`, `images-calendar.test.ts`, `images-avatar.test.ts`, `branding-asset.test.ts`,
  `media-resources.test.ts`, `tests/unit/server/unwrap-resource.test.ts`, and the two inbound-protocol pins
  (`tests/unit/server/rum-intake.test.ts`, `tests/unit/server/webmention-receive.test.ts`) drive every relocated public
  resource and protocol through the stub-Kobato harness (`tests/utils/stub-kobato.ts`; the protocol handlers use its
  `installStubKobatoFetch` seam, which rides the REAL `createKobatoServerClient` transport over a stubbed
  `globalThis.fetch`) and pin the exact status codes, bodies, content types, cache headers, and ETags kobato answered
  when these were forwarded or served by its routers (streaming-byte proof lives in the pack smoke and the api/server
  tests).
