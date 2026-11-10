# Client conventions

`src/client/` is browser-only. May import from `shared/` and other `client/`. Must not import any `server/` module or Node-only API.

## Structure

- `hooks/` — browser hooks. Admin file uploads go through `useFileUpload` (`@/client/hooks/use-file-upload`): it owns the CSRF read, accept/size guards, FormData POST, error unwrap, and toast choreography. Never hand-roll a fetch upload in a view. `use-device-env-beacon` is the ADR-0006 collector: mounted once by `routes/public/layout.tsx`, it reads the deepest match's `eid`, honors `navigator.doNotTrack === '1'`, and `sendBeacon`s one payload per page view (the static block once per session via the `kobato.env.static` marker; a bounded in-memory sent-id set drops navigation replays) — no fetch fallback. `use-rum` (ADR-0012) is mounted once by the root `App`, renders no DOM, and runs only in an effect: it returns before the dynamic import when the root loader supplied no bootstrap (frontend RUM not configured, or the O2 pipeline gate withheld it), when `navigator.doNotTrack === '1'`, when GPC is `true`, or when the bootstrap fails the strict schema — a denied/disabled browser never downloads the SDK chunk, and neither does a visitor of a site without an active frontend configuration. The root bootstrap is emitted in EVERY build once the server-side OpenObserve pipeline verification gate passes; an offline/missing/wrong pipeline leaves it absent. The effect's `import.meta.env.SSR` early return is a build-time constant that removes the dynamic import edge from the server graph, so the SSR/SEA bundle carries no `@openobserve` code. It forwards a `{ id, template }` route identity (deepest match) and nothing else: no pathname, search, params, or title.
- User-facing hook copy is translated, never literal: a hook that only runs under the React tree (e.g.
  `useAutosave`) reads `useI18n()` itself, while hooks that can be called from non-React entry
  points (`useFileUpload`) take the caller's `t` explicitly. Both keep English as the catalog
  baseline and every locale in step.
- `lib/` — pure browser helpers shared by hooks/components (`logger`, `motion`, `draft-store`, …). `openobserve-rum.ts` (ADR-0012) is the ONE client SDK entry: it dynamically imports `@openobserve/browser-rum-slim` after the root-loader bootstrap gate (so the SDK ships in its own lazy chunk), maps the bootstrap onto the real `site`/`insecureHTTP`/`organizationIdentifier`/`apiVersion`/`service`/`env`/`version` options, and initializes with `trackResources`/`trackLongTasks` on, user interactions off, Replay/telemetry/profiling rates 0, `defaultPrivacyLevel: 'mask'`, no anonymous user, no baggage, no resource headers, no compression worker. `allowedTracingUrls` is a same-origin predicate with only `tracecontext`; analytics beacon/SSE, OpenObserve intake, and probes are excluded. `startRum` is idempotent under StrictMode/HMR and never throws. `rum-sanitizer.ts` is the pure, synchronous `beforeSend` allowlist: it builds a NEW event and the policy replaces the SDK event in place; unknown shapes/types, unrecognized dynamic URLs, and any thrown error drop the event (never return the raw event). The slim SDK wraps `beforeSend` in `limitModification`, which copies only declared paths (`context`, `view.url`/`view.name`/`view.referrer`, `resource.url`, `error.message`/`error.stack`, `service`, `version`) back onto the event — browser-side deletion of other fields is discarded by the SDK. It also ignores `false` for `view`: `rum-sanitizer` overwrites the view's modifiable free fields with the trusted route (or `unknown`/`/unknown`) BEFORE any risky work and sends a safe minimal view on failure; every other event type still returns `false`. `error.stack` is therefore always overwritten (empty when no same-origin frame survives), and the OpenObserve ingest pipeline in `scripts/trace/` is the authoritative fail-closed allowlist boundary (every unnamed field is dropped) for device/display/headers/raw performance objects; run `trace:init` before enabling frontend RUM. `openobserve-rum.ts` also polls the no-store `/api/rum/status` endpoint every 10s; false/error calls `setTrackingConsent('not-granted')` for the already-open page, recovery restores `granted` when DNT/GPC allow and calls the slim SDK's `startView(current route id)` in the same document (no reload/navigation), so an open editor's unsaved input is preserved. Consent recovery is poll-only: a SPA route change or `startRum` while not-granted only updates the view name and restarts the poll; it never re-grants or calls `startView`. The status path is excluded from RUM activity/tracing/resources. When the root bootstrap becomes null because the O2 gate was withheld, `suspendRum()` revokes consent but keeps the SDK handle, route, and status poll, so a later gate recovery calls `startView(current route id)` in the same document (no reload/navigation). DNT/GPC, an invalid bootstrap, and a real unmount call `stopRum()` instead and never keep the poll alive for automatic recovery. A valid route change cancels the deferred cleanup, so the SDK is not re-initialized. An initially disabled/denied browser still never requests the module. URL policy (`rum-url-policy.ts`) is also the single telemetry-exclusion predicate (`/api/analytics/*`, `/api/rum/status`, `/health`, `/ready`, `/rum/`) reused by `openobserve-rum.ts`: same-origin `/assets/<generated>` keeps its path; oRPC HTTP paths (`/rpc/content/posts/bySlug`, legacy `/rpc/content.posts.bySlug`) normalize to one dotted procedure template (`/rpc/content.posts.bySlug`, closed identifier segments only); Vite DEV module sources keep their app-authored/generated path (`/src/**` with a closed extension allowlist, exact `/@vite/client`/`/@vite/env`/`/@react-refresh`, `/node_modules/.vite/deps/<file>.js`), while `/@fs`, traversal segments, source maps, and filesystem roots drop; declared route families (`/posts/:slug`, `/cats/:slug/page/:num`, `/search/:keyword`, `/admin/:path`, `/storage/:key`, `/images/:asset`, …) replace dynamic paths; query/fragment always removed; cross-origin and unknown multi-segment URLs dropped. Errors keep a closed `error.type`, fixed `<source>_error` message, stable `code` (`NOT_FOUND`/`http_404`) and same-origin-only stack frame locations; resource events keep the W3C `_o2.trace_id`/`span_id`. `rum-budget.ts` owns the 500 resources / 100 errors per SDK session cap (restored from one `kobato.rum.budget` sessionStorage entry on reload, reset on a session-id change; dropped events do not consume budget). `rum-route.ts` derives the stable route identity from `useMatches`. `device-env` owns the ADR-0006 field collection (`collectStaticEnv` / `collectDynamicEnv`): every browser API is read defensively and an absent/non-finite value is omitted from the payload, never sent as null. `locale-sync` is the cross-tab settings-locale transport: a `BroadcastChannel` announcement (`publishLocaleChange(locale, origin, revision?)`) plus a subscription (`subscribeLocaleChange(origin, handler)` handing the handler `{ locale, revision? }`). It carries an ANNOUNCEMENT, not state — peers reload from the server after flushing their own dirty cards and never re-publish, and a publisher ignores its own echo by `origin` (a `BroadcastChannel` loops back in-document). The sender's bootstrap settings `revision` rides along as an opaque dedupe token. A missing/blocked API degrades to a no-op, never a throw. The ROOT-level orchestration (`LocaleSyncProvider`, mounted in `src/root.tsx`) owns the subscription so every document — settings, editor, analytics, public — follows it. Only a registered settings workspace flushes and reloads automatically; a document without a flush host (editor, comment composer, setup, public) is never reloaded automatically — unsaved input is invisible to the app — and instead shows a localized notice with an explicit Reload action.
- `editor/` — host glue for the `src/inkling` editor layer: the page/article composer (R11; consumed by
  `@/ui/admin/editor/PageBodyEditor`) and the comment composer (R12; consumed by
  `@/ui/public/comments/CommentBodyEditor`). `page-editor-nodes` (the composer node set — every mounted
  type must stay inside `FULL_EDITOR_NODE_TYPES`, contract-tested; AsideNode filtered,
  KobatoImageNode replaces the stock image card by type), `comment-editor-nodes` (the trimmed
  comment node set — EDITOR_BASE_NODES minus headings/aside/tables plus the CodeBlock
  class, contract-tested against `COMMENT_COMPOSER_NODE_TYPES`; NO math classes — formulas
  are ```math fences rendered to KaTeX MathML by the server-side comment projection),
  `comment-legacy-math` (seed-time downgrade mapping R12-era math/math-inline nodes onto the
  fence dialect so legacy comments still open in the trimmed composer),
  `comment-markdown-transformers` (the DEFAULT_TRANSFORMERS subset whose dependencies survive the
  trim — quote/list/code-fence/text-format/link shortcuts), `kobato-image-node` (the stock ImageNode
  subclass persisting the four kobato dataset keys), `image-insert-override` (HIGH-priority
  INSERT_IMAGE_COMMAND / OPEN_IMAGE_LIBRARY_COMMAND handlers — the two surviving class-identity
  gates: inserts build the kobato class, and the library intent inserts an empty card with the
  `openPicker` payload flag so the inkling pick seam opens the library picker), `image-library-pick`
  (the 'image' picker registration through the seam's variant channel, `registerCardPicker`, plus
  the pick→dataset write through the card write seam), `page-editor-upload` (paste/drop/file-dialog
  uploads through `orpc.admin.images.upload`; the uploader reads `useI18n()` itself and memoizes
  `upload` on the translator so the composer's identity contract holds), `page-editor-card-config` +
  `render-math` (card policy + the debounced server KaTeX preview channel — both are factories
  taking the translator, so `PageBodyEditor` memoizes one card config per `t`; `resolveMathError`
  turns the server's error descriptor into the single string Inkling accepts, falling back to
  `fallbackMessage` when the active catalog does not know the key — a raw catalog key never
  reaches the editor),
  `inkling-labels` (the client seam for the Inkling label overlay — the four per-locale tables live
  in `@/shared/i18n/inkling-labels/**` and stay out of the browser's static graph. WORKSPACE
  documents (`/admin`, `/editor`) read the root loader's `i18n.inklingLabels` payload through
  `useKobatoInklingLabels()`; a missing payload degrades to Inkling's English defaults. PUBLIC
  documents carry no table, so `loadInklingLabels(locale)` — the ONE sanctioned dynamic import of a
  table module — fetches exactly the active locale's chunk. Hover/focus intent prefetches that chunk
  together with the composer chunk (`warmChunks`), so a touch device's first tap never serializes
  the label request behind the editor request; the composer still mounts only once the labels
  resolve. The four locales are four chunks, never one. `LazyCommentBodyEditor` passes the table
  through `CommentBodyEditor` → `EditorSurfaceComposer`. The module also holds
  the compile-time pin that every shared table key is legal for Inkling; no static table import is
  allowed anywhere in the client),
  `use-focus-mode` (the writing-focus preference toggle),
  `editor-surface` (the composer skeleton both surfaces share: `useEditorSurface` — the
  registerAPI → editor-instance dance + body mount-snapshot/reseed wiring — and
  `EditorSurfaceComposer`, the InklingComposer shell with the root payload's active-locale labels,
  the locale as the word-count language, and theme-driven darkMode applied; every delta — node set,
  fileUploader/cardConfig, ui-prefs flags — passes through, `nodes` stays required),
  `block-quote-aside-cycle` (the host-side Ctrl+Q capture shared by both surfaces — neither composer
  registers AsideNode), `use-editor-body-reset` (the shared body-lifecycle glue: mount-snapshot seed,
  imperative reseed on `bodyKey` change, stable narrowing `handleChange`), and `base-node-filter`
  (`excludeBaseNodes` — the one EDITOR_BASE_NODES exclusion filter both manifests run; owns the
  getType/replacement-pair cast). `editor/cards/` holds the R10 host-card
  assemblies (solution / two-column / music-player): each module builds its base node class from
  the shared spec (`@/shared/lexical/cards/`) through the `@/inkling` barrel's
  `generateDecoratorNode` — a DISTINCT class object from the server projection's, since client and
  server each assemble their own class from the shared spec — then registers it via top-level
  `defineCard`. The decorate chrome components and the
  exportDOM markup share the spec's class/copy constants; `tests/unit/client/editor/cards/` pins
  that parity (the WYSIWYG gate). The specs' `menu[].label`/`desc` are English fallbacks, never a
  hardcoded locale — the composer's slash menu localizes them through `labelKey`
  (`menu.host.<key>.*` in the `inkling-labels/` tables), and the card chrome's own copy
  (placeholders, replace/remove affordances, pick placeholders) reads the `admin.editor.cards.*`
  catalog keys through `useI18n()`.
- `api/` — oRPC client. All RPC calls go through `orpc.<domain>.<endpoint>(flatInput)` from `@/client/api/client`; server errors arrive as `ORPCError` rejections whose `message` already carries the request-locale issue summary for descriptor errors, with the structured `{ descriptor, issues }` in `data` (the client never inspects `data` for copy and installs no rejection interceptor). Every wire issue also carries its own request-locale `message` next to the descriptor (`messageKey`/`params`/`fallbackMessage`), so a consumer that only reads issue text never sees a key; legacy bare-array rejections fall back to their server message unchanged. TanStack Query wrappers live in `@/client/api/orpc-query`. Every public-site read flows through oRPC end to end: browser-side interactions use this `/rpc` client, and SSR data (public routes + root loader) goes through the read-only `content.*` group via the in-process caller (`@/server/http/ssr-caller`) — no route talks to domain services directly.

## Patterns

- All interactivity lives in React hooks/components under `@/client/` and `@/ui/`. No separate browser-script pipeline.
- Interactive components call resource URLs through the oRPC client. No server-module imports (type-only imports for `RouterClient<ApiRouter>` are allowed — `import type` erases at compile time).
- Heavy widgets reach the bundle via React.lazy + Suspense, not top-level imports.
- Avoid new client deps unless the interaction needs them.

## iOS auto-zoom

iOS Safari zooms in when focusing a control with `font-size < 16px`. The zoom is decided when the TAP'S DEFAULT ACTION focuses the target — rewriting the viewport `<meta>` from `focusin` is already too late (the original hook's failure mode on real devices). The lock is refcounted in `@/client/lib/viewport-zoom-lock` (`acquireViewportZoomLock` / `releaseViewportZoomLock`; iOS/iPadOS WebKit only, no-op elsewhere): every activation that will end in a focus holds the lock BEFORE focus lands, then releases — the activation stays zoom-free while pinch-zoom remains available for the editing session. `useIosNoZoomOnFocus()` in `@/client/hooks/use-ios-no-zoom` is mounted once at the top of `src/root.tsx`'s `App` and drives the lock from document level: `pointerdown` in the CAPTURE phase acquires it (before any default action can focus the tapped control), form controls (`INPUT`/`TEXTAREA`/`SELECT`) keep it for their whole focused session (the keyboard's "next" hop has no pointerdown to relock), and a contenteditable canvas releases on the task after its focus lands. The comment composer's activation handoff (`LazyCommentBodyEditor`) holds the same lock from the activating tap / eager mount until one task after the contenteditable takes focus. Do NOT re-install the hook per-form and do NOT rewrite the viewport `<meta>` anywhere else — both race the same refcount.
