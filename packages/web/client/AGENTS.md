# Web-client conventions

`@kobato/web-client` (`packages/web/client/`) is the browser platform layer: document-level hooks, the oRPC client, the
root settings contexts, route warmup, and the cross-surface editor platform. It may import the shared leaves it declares
(`@kobato/{utils,i18n,settings,distribution}`), `@kobato/api` (the wire contracts), `@kobato/ui`, `@kobato/inkling`. It
must NOT import `@kobato/web-admin` or `@kobato/web-public` (a client module needing a product component moves up to
that leaf), and must NOT import `@kobato/server` or use Node-only APIs — the oRPC client is typed exclusively through
`ContractRouterClient<typeof apiContract>` from `@kobato/api`.

## Structure

- `hooks/` — the seven document-level hooks, each mounted once per document: `use-rum`, `use-rum-consent`,
  `use-device-env-beacon` (one `sendBeacon` per page view, DNT honored), `use-ios-no-zoom`, `use-chunk-error-recovery`,
  `use-detach-public-css`, `use-focus-hash`. Product-level hooks live in the product leaves.
- `use-rum`: mounted once by the root `App`, renders no DOM, runs only in an effect. It returns before the dynamic
  import when the bootstrap is absent, DNT/GPC deny, or the schema check fails. A `clientIdentity: 'forward'` bootstrap
  adds the consent gate (`lib/rum-consent`, localStorage `kobato.rum.consent`); `declined` fully stops a running SDK;
  `App` renders `RumConsentBanner` only post-mount, only while undecided.
- The root bootstrap is emitted in EVERY build once the server-side pipeline gate passes; the effect's
  `import.meta.env.SSR` early return keeps the dynamic-import edge out of the server graph. It forwards a
  `{ id, template }` route identity and nothing else.
- `lib/` — pure browser helpers (`motion`, `chunk-error`, `device-env`, `locale-sync`, `viewport-zoom-lock`); the RUM
  family lives in `lib/rum/`.
- `lib/rum/openobserve-rum.ts` is the ONE client SDK entry: dynamically imports `@openobserve/browser-rum-slim` after
  the gate, points the SDK's `proxy` at the same-origin `/api/rum/intake` relay (the OpenObserve endpoint/organization
  and real token never reach the browser). Init: interactions off, Replay/telemetry/profiling rates 0,
  `defaultPrivacyLevel: 'mask'`, no anonymous user, same-origin `allowedTracingUrls` only. `startRum` is idempotent and
  never throws.
- `rum-sanitizer.ts` is the pure, synchronous `beforeSend` allowlist: builds a NEW event; unknown shapes, unrecognized
  URLs, and any thrown error drop it. It overwrites the view's free fields with the trusted route BEFORE any risky work;
  `error.stack` is always overwritten. The OpenObserve ingest pipeline is the authoritative fail-closed boundary — run
  `trace:init` before enabling frontend RUM.
- Status polling: `/api/rum/status` every 10s; false/error calls `setTrackingConsent('not-granted')`, recovery restores
  `granted` and calls `startView(current route id)`. A null bootstrap calls `suspendRum()`; DNT/GPC, invalid bootstrap,
  and real unmount call `stopRum()`. `rum-url-policy.ts` is the single telemetry-exclusion predicate; `rum-budget.ts`
  owns the 500 resources / 100 errors session cap.
- `device-env` reads every browser API defensively — absent/non-finite values are omitted, never sent as null.
- `locale-sync` is the cross-tab locale transport: a `BroadcastChannel` announcement, not state — peers reload from the
  server after flushing their own dirty cards and never re-publish. The ROOT-level `LocaleSyncProvider` (mounted in
  `src/root.tsx`) owns the subscription; only a registered settings workspace auto-reloads, every other document shows a
  localized notice with an explicit Reload. A missing/blocked API degrades to a no-op.
- `settings/blog-settings-context.tsx` — one context per section (never one bundle context); adding a section = create
  the context and register it in `SECTION_CONTEXTS_ANY`.
- `route-warmup/` — `RouteWarmupScript` renders the inline idle-preload script; the manifest contract lives in
  `@kobato/distribution/warmup-manifest`, wire constants in `@kobato/distribution/route-warmup`.
- `editor/` — the cross-surface editor platform both composers share: `editor-surface` (`useEditorSurface` +
  `EditorSurfaceComposer`, the InklingComposer shell with active-locale labels, word-count language, darkMode),
  `base-node-filter`, `block-quote-aside-cycle`, `use-editor-body-reset`, `inkling-labels`. The page composer is
  consumed by `@kobato/web-admin/ui/editor/PageBodyEditor`, the comment composer by
  `@kobato/web-public/ui/comments/CommentBodyEditor` — node sets, host cards, uploads, pickers, and copy live beside
  each consumer.
- `inkling-labels` is the client seam for the Inkling label overlay: WORKSPACE documents read the root loader's
  `i18n.inklingLabels` payload; PUBLIC documents `loadInklingLabels(locale)` — the ONE sanctioned dynamic import of a
  table module. Four locales are four chunks; no static table import anywhere in the client.
- `api/` — all RPC calls go through `orpc.<group>.<domain>.<endpoint>(flatInput)` from `@kobato/web-client/api/client`
  (the three groups mirror `apiContract`: `public` — the anonymous surface, `account` — the signed-in viewer incl. self
  keys spread at the root such as `orpc.account.profile`, `admin`); errors arrive as `ORPCError` rejections with
  `{ descriptor, issues }` in `data` (the client never inspects `data` for copy and installs no rejection interceptor).
  `api/client` is the browser singleton ASSEMBLY only — the CSRF token store + `setCsrfToken`, the same-origin
  `${location?.origin ?? 'http://localhost'}/rpc` URL default — delegating to the React-free `createKobatoClient`
  factory from `@kobato/api/client/create-client`; web-client declares no `@orpc/client`/`@orpc/contract` of its own.
  The headless public seam for external (non-browser) consumers is the sibling factory `createKobatoPublicClient` in
  `@kobato/api/client/create-client` — same transport, `public` group only; this leaf keeps the full-tree singleton
  because its surfaces reach `account`/`admin` too. Wire error payload decoding (`extractApiErrorMessage` /
  `isApiAccepted` / `apiErrorDescriptorKey`) lives in `@kobato/api/client/error`. TanStack Query wrappers live in
  `api/orpc-query` — React Query stays at this seam permanently. No route talks to domain services directly.

## Patterns

- All interactivity lives in React hooks/components — the one non-React script is the route-warmup idle loader,
  generated through the build-time virtual module.
- Heavy widgets reach the bundle via React.lazy + Suspense, not top-level imports.

## iOS auto-zoom

iOS Safari zooms when focusing a control with `font-size < 16px`, decided when the tap's default action focuses the
target — rewriting the viewport `<meta>` from `focusin` is too late. The lock is refcounted in `lib/viewport-zoom-lock`
(iOS/iPadOS WebKit only): every focus-ending activation holds the lock BEFORE focus lands. `useIosNoZoomOnFocus()` is
mounted once at the top of the root `App`; the comment composer's activation handoff holds the same lock. Do NOT
re-install the hook per-form and do NOT rewrite the viewport `<meta>` anywhere else.
