# Kobato app

`apps/kobato` is the deployable React Router 8 Framework Mode app (`appDirectory: 'src'`, SSR). It wires routes to
product code and owns nothing reusable: UI in `@kobato/web-*`/`@kobato/ui`, backend in `@kobato/server`, contracts in
`@kobato/api`. The browser runtime under `src/document/`, `src/rum/`, and `src/route-warmup/` is consumed by this app
alone — nothing outside `apps/kobato` imports it.

- `src/root.tsx`, `src/routes.ts`, `src/entry.server.tsx`, `src/server.ts` — the framework entry set (`server.ts` is
  resolved by `@kobato/server/infra/hono/dev.ts`); `src/zod-config.ts` must be imported first, before any schema
  evaluates.
- `src/routes/` — four surface trees (`public/`, `auth/`, `admin/`, `editor/`); see `src/routes/AGENTS.md`. Route
  modules wire loader/action data to controllers and render; no business logic, no DB imports.
- `src/seo/` — the typed route-meta factory over `@kobato/catalog/seo` builders (app-owned because it feeds the `meta`
  route export).
- `src/document/` — document-level behavior mounted once by the root or a layout route: `use-chunk-error-recovery`,
  `use-detach-public-css`, `use-device-env-beacon` + `device-env`, `use-focus-hash`, `use-ios-no-zoom`.
- `src/rum/` — frontend RUM: `use-rum`, `use-rum-consent`, the SDK entry `openobserve-rum.ts`, `rum-sanitizer.ts`,
  `rum-budget.ts`, `rum-route.ts`, `rum-url-policy.ts`, `rum-consent.ts`.
- `src/route-warmup/` — `RouteWarmupScript` renders the inline idle-preload script; the manifest contract lives in
  `@kobato/distribution/warmup-manifest`, wire constants in `@kobato/distribution/route-warmup`.
- `src/styles/` — app-owned Tailwind entries; see `src/styles/AGENTS.md`.
- `tests/` — `arch/`, `unit/`, `it/`, `snaps/`, `browser/`, `e2e/`; see `tests/AGENTS.md`.
- Imports: `@/...` app source, `@tests/...` app test helpers, `@kobato/<package>/...` product code. No relative
  specifiers outside the documented exceptions (root `AGENTS.md`).
- `drizzle-orm` is a tests-only devDependency (seed/assertion code); production source never imports it.

## Document runtime

- Document-level hooks mount once per document — never per form or per route component that can render more than once.
- `use-rum` — mounted once by the root `App`, renders no DOM, runs only in an effect, and returns before the dynamic
  import when the bootstrap is absent, DNT/GPC deny, or the schema check fails. `clientIdentity: 'forward'` adds the
  consent gate (`rum-consent`, localStorage `kobato.rum.consent`); `declined` fully stops a running SDK; `App` renders
  `RumConsentBanner` only post-mount, only while undecided. The bootstrap is emitted in EVERY build once the server-side
  pipeline gate passes; `import.meta.env.SSR` early return keeps the dynamic-import edge out of the server graph. It
  carries a `{ id, template }` route identity and nothing else.
- `openobserve-rum.ts` is the ONE client SDK entry: dynamically imports `@openobserve/browser-rum-slim` after the gate
  and points the SDK's `proxy` at the same-origin `/api/rum/intake` relay (the OpenObserve endpoint/organization and
  real token never reach the browser). `startRum` is idempotent and never throws.
- `rum-sanitizer.ts` — the pure, synchronous `beforeSend` allowlist: builds a NEW event; unknown shapes, unrecognized
  URLs, and any thrown error drop it. The OpenObserve ingest pipeline is the authoritative fail-closed boundary — run
  `trace:init` before enabling frontend RUM.
- Status polling: typed `orpc.public.observability.rumStatus` gates consent — a false/error/malformed response calls
  `setTrackingConsent('not-granted')`, recovery restores it; a null bootstrap suspends the SDK. The external intake path
  and SDK proxy URL builder live in `@kobato/api`; `rum-url-policy.ts` derives self-telemetry exclusions from procedure
  metadata; `rum-budget.ts` owns the session caps.
- `use-device-env-beacon` sends one standard-oRPC-envelope `sendBeacon` per page view to
  `/rpc/public/analytics/recordDeviceEnv`, DNT honored. `device-env` reads every browser API defensively —
  absent/non-finite values are omitted, never sent as null.
- iOS auto-zoom: iOS Safari zooms when focusing a control with `font-size < 16px`; rewriting the viewport `<meta>` from
  `focusin` is too late. The lock is refcounted in `@kobato/web-public/ui/comments/viewport-zoom-lock` (iOS/iPadOS
  WebKit only): every focus-ending activation holds the lock BEFORE focus lands. `useIosNoZoomOnFocus()` is mounted once
  at the top of the root `App`; the comment composer's activation handoff holds the same lock. Do NOT re-install the
  hook per-form and do NOT rewrite the viewport `<meta>` anywhere else.
- Chunk-error recovery: `use-chunk-error-recovery` and `useReloadOnChunkError` call `triggerChunkReload` from
  `@kobato/web-public/ui/chrome/chunk-reload`, the reload store `ChunkReloadOverlay` subscribes to.
- `compiled-script` under `src/route-warmup/` is replaced at build time by the `routeWarmupPlugin` virtual module
  (`tools/pack/src/vite/route-warmup.ts`); that idle loader is the one non-React script in the app.
