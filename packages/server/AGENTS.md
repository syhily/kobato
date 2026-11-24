# Server conventions

`packages/server/src/` (`@kobato/server`) is SSR-only: it imports `@kobato/db`, `@kobato/api`, the shared leaves, and
`@kobato/inkling` only through `/headless` — never `@kobato/web-*` or `@kobato/ui`.

```
server/
├── assets/     # Static asset blobs + manifest (data, outside the layer graph).
├── bootstrap/  # Composition root: engine lifecycles and wire* seams.
├── infra/      # Technical primitives — zero business knowledge.
├── domains/    # Self-contained business modules (one folder per domain).
├── http/       # HTTP perimeter (oRPC + Hono).
└── render/     # SSR output products (HTML, RSS/Atom, OG, calendar, SEO).
```

## Layer graph (`apps/kobato/tests/arch/server-layers.test.ts`)

- Only `bootstrap/` may know every layer, and nothing imports it. `assets/` is static data outside the import graph. A
  file belongs to exactly one root.
- `infra/*` imports nothing from `domains/`, `http/`, or `render/`. `domains/*` imports nothing from `bootstrap/*`:
  wiring goes through `wire*` seams; background jobs self-register on `infra/job-registry`.
- `http/controllers/*` and `http/loaders/*` orchestrate only; `render/*` never persists.
- A domain's `repos/**` is private; cross-domain consumers import the surface
  (`apps/kobato/tests/arch/server-public-surface.test.ts`). Domain imports stay acyclic — a cycle resolves through an
  injected parameter wired by the caller.
- `drizzle-orm` is a test-only devDependency; production source imports no persistence driver or unwrap seam. No barrel
  `index.ts`, no `*.server.ts` suffix.
- Naming: `kebab-case.ts`/`.tsx`; entity domains plural, mass nouns singular; `*.controller.ts` only for router-owning
  controllers; every `http/loaders/*.ts` exports a loader.

## infra/ (`src/infra/AGENTS.md`)

- `db/` — persistence adapters only (paths, job-run-recorder, insert-batcher + batcher-registry, maintenance,
  query-diagnostics); engines and schemas live in `@kobato/db`.
- `job-registry.ts` — jobs self-register `(name, nextDelayMs, run)` at import; `startAllRegisteredJobs()` arms them.
  Timers live in `scheduler-utils::scheduleJob`; a catalog `task: { key, recordHistory? }` adds live state and `job_run`
  history. `scheduleJob` owns the single `job.run` trace perimeter (name + task key only).
- `cache/` — `file-store` owns the on-disk plane (`<storage.data>/cache/<bucket>/<h[0:2]>/<h[2:]>`, `KBC1` envelope,
  `_generation` counters); `memory-store` is the process-local L1 (>64 KiB values and the `og`/`calendar` buckets never
  enter) and hands every caller the SAME object — cache results are read-only. `cache/registry` verbs take NO
  `Database`; `through` writes are fire-and-forget; L1 invalidation is synchronous and precedes the filesystem leg.
  Settings-derived render entries key on the section-scoped representation generation
  (`@kobato/settings/representation-scopes`), never on the boot-unique `AppLocalization.revision`.
- `http/` — `etag`, `headers`, `status`, `errors` (`DomainError`/`ActionFailure`), `email/`, `image/`, `crypto/`,
  `config.ts`, `i18n.ts`, `logger.ts`, `rate-limit.ts`, `slug/`, `data-paths.ts`, `sea/`. Post search is NOT infra.
- `trace/` — only `runtime.ts` and `logs-runtime.ts` import `@opentelemetry/*`, through one dynamic import in
  `domains/observability/runtime-manager.ts`; a disabled/unverified config never constructs a provider
  (`apps/kobato/tests/arch/trace-sdk-boundary.test.ts`). Labels carry closed vocabularies only — never URL, host, query,
  SQL, parameters, keys, or payload.
- `email/` — copy lives in the SERVER catalog; every template takes an explicit `t: ServerTranslator`; user-authored
  content is passed raw, never translated.
- `safe-fetch.ts` — THE outbound-fetch surface for user-influenced URLs (SSRF guard); `trustedOrigin` is the ONE
  private-network exemption (exact-match, admin-validated). Raw `fetch(` sites are pinned to an audited allowlist; logs
  use `redactUrlForLog`. `__setDnsLookupForTests` replaces DNS for tests that stub `fetch`; tests of the DNS guard mock
  `node:dns/promises` and must NOT set the seam.

## domains/

One folder per business domain; base vocabulary `schema.ts / repo.ts / service.ts / projection.ts / cache.ts` plus
feature files. Once a subdirectory exists (`services/`, `repos/`), the root file MUST NOT coexist.

- Strata: **Core** (`content`, `posts`, `pages`, `settings`), **Feature** (`auth`, `users`, `comments`, `taxonomies`,
  `images`, `assets`, `fonts`, `music`, `friends`, `newsletter`, `webmentions`, `notifications`), **Platform**
  (`analytics`, `audit`, `backup`, `update`, `storage`); Platform services are leaves. Dedicated docs: `fonts`,
  `storage`, `backup`. `update/` MUST close the listen socket before spawning the replacement
  (`job.ts::scheduleSelfRestart`).
- `notifications/` — rows fan out at creation into `notification_recipient` (unread = `readAt IS NULL`). `direct` is
  always replyable, `admin` never, `broadcast` only for NON-ADMIN recipients; a reply to a replyable broadcast FORKS a
  new `direct` thread to all current admins. Reads/replies gate on `isThreadParticipant` (LIMIT-1 probes). Recall is a
  soft delete: `recalled_at` stamps only where NULL, audits fire only on the first call, every read filters
  `recalled_at IS NULL`. Email is fire-and-forget AFTER `createAndFanOut` in the `direct`/`admin` producers, gated by
  `mail.enabled` AND `mail.notificationEmails`; broadcasts never email; maintenance prunes READ rows and orphan roots at
  180 days. `admin`-kind rows store the English fallback plus a nullable i18n descriptor; persisted keys are
  append-only; every read resolves through `domains/notifications/message.ts`.
- Outbound webmentions are `webmention_outbox` rows (UNIQUE(source,target)) run by a sequential single-worker loop: 5
  rows/wake, 5 attempts with backoff capped at 12h, ≥1s apart. Scheduled posts wait for their publish instant; a later
  republish only raises `nextRetryAt`; `sent` rows never re-send.

## http/

HTTP perimeter only: `orpc-base.ts`, `contract-implementation.ts`, `request-context.ts`, `hono-env.ts`, `api-router.ts`,
`errors.ts`, `app.ts`, `orpc-trace.ts`, `middlewares/`, `controllers/` (`public/`, `account/`, `admin/`), `resources/`,
`loaders/`, `route-cache-headers.ts`, `request/`, `ssr-caller.ts`.

- Controllers and loaders **orchestrate only** — logic stays in `domains/<x>/service.ts`. `controllers/**` mirrors the
  `apiRouter` groups one-to-one (`apiRouter.public.comments` ⇔ `controllers/public/comments-*.controller.ts`); only the
  route-less shared factories (`admin/revision-shared.ts`, `account/auth-shared.ts`) are excepted.
- Two URL surfaces, never conflated. The **route method/path metadata** from `@kobato/api` is a REST-style compatibility
  record, never a mounted REST surface (`admin.analytics` keeps its legacy `/analytics/*` route metadata — the one
  non-`/admin/` admin prefix). The **`/rpc/*` transport URLs** derive from the ROUTER TREE KEYS
  (`/rpc/{public,account,admin}/...`) and are the ONLY transport: `app.ts` hands `c.req.raw` to the handler, and every
  caller — in-repo or headless (`createKobatoPublicClient`) — uses them.

### Sign-in & install flows (`account.auth.*` / `account.setup.*`)

- `controllers/account/auth.controller.ts` owns signin: `status` (view/redirect union: logged-in redirect,
  reset/invite/magic token peek, OTP pending/expired + `markSessionDirty`, csrf token), `identify`, `login`, `logout`,
  `magicLink`, OTP verify/resend/cancel, password reset (+ author invite). `passkey.authFinish` sits in the passkey
  controller.
- `controllers/account/setup.controller.ts` owns install: `status` (mint-or-read setup token + session projection),
  `verifyToken` (keyed rate limit — the 429 rides the wire error variant; session flag + `markSessionDirty`), `install`
  (session/token gates; `signUpAdminSchema` safeParse so field copy stays `auth.setup.error.*` descriptors;
  `signUpInitialAdminWithSession`).
- All are `implementPublic` — anonymous ceremonies with their own rate limits — and still pay the global `csrfGuard`
  (none carries `publicRead`). Wire inputs are deliberately permissive: controllers adapt the camelCase inputs to
  `FormData` (auth) or the domain schema (setup) so the services keep owning user-visible error copy.
- Controllers re-validate every `redirectTo` with `safeRedirectPath` themselves (action fallback
  `AUTH_ACTION_REDIRECT_FALLBACK`, status fallback `AUTH_STATUS_REDIRECT_FALLBACK`, both in
  `@kobato/api/contracts/account/auth`) — never trust route-side sanitization.
- Flow cookies move from `AuthFlowResult` onto `context.responseHeaders` (`wireAuthFlow`) and never enter the wire
  output; the `/rpc` mount and `createSsrCaller` emit them as real `Set-Cookie` headers.
- Error translation seam: `errors.ts` (vocabulary), `translate-domain-error.ts` (domain error → `ORPCError`),
  `localized-http-exception.ts` + `leaked-response.ts`.
- `orpc-trace.ts` is the oRPC transport seam (`/rpc/*` + in-process `ssr-caller`); spans carry the stable procedure
  path, never input.
- `buildCspHeader` is the single dynamic-CSP owner and NEVER widens `connect-src`. The browser SDK posts RUM to the
  same-origin relay `POST /api/rum/intake/rum/v1/<org>/rum` (`http/resources/rum-intake.ts`), mounted in EVERY build
  beside the anonymous `publicRead` procedure `public.observability.rumStatus` — both install-gate-exempt and
  trace-exempt; intake caps live in the external resource. The OpenObserve origin appears in no policy, document, or
  CORS entry.

### Public content API (`public.content.*`)

- The public read-only contract (Ghost-Content-API style) is implemented by
  `controllers/public/content-*.controller.ts`; schemas in `@kobato/api/contracts/public/content.ts`. Admin SSR lives in
  the domain groups — there is deliberately NO page-level aggregate group; loaders compose domain endpoints.
- Public route loaders and the root loader consume it through `createSsrCaller` (`ssr-caller.ts`) — in-process, no HTTP
  hop — which also owns `unwrapListing`/`unwrapDetail`.
- `loaders/*` (`listing`, `search`, `sidebar`, `comments`, `detail-critical` + the `page-preview` / `post-detail` /
  `home` pipelines) are the orchestration layer; pipelines signal 301/302/404 by throwing `Response`s mapped by
  `http/content-signals.ts`.
- `content-detail.controller.ts` fingerprints its payload (`postEtag`/`pageEtag`) and answers `not-modified` only then;
  draft previews carry `etag: null`. Listings fingerprint with `listingEtag` (locale/zone/format + revisions +
  `APP_VERSION` + calendar day) and record a page view only for a served document. Sidebar "random" widgets are
  DETERMINISTIC per representation (seeded shuffle — a per-request CSPRNG would break the ETag).
- `public.content.bootstrap` takes no input: theme cookie + message scope resolve inside, Inkling labels ship only for
  signed-in workspace documents, `observability` is dropped from the anonymous projection.

### Base procedures

| Base         | Guard                                 | Use for                    |
| ------------ | ------------------------------------- | -------------------------- |
| `publicProc` | No auth gate; `csrfGuard`             | Anonymous + CSRF mutations |
| `authedProc` | `requireAuth` + `csrfGuard`           | Any logged-in user         |
| `authorProc` | `requireRole('author')` + `csrfGuard` | Authors and admins         |
| `adminProc`  | `requireRole('admin')` + `csrfGuard`  | Admins only                |

`csrfGuard` runs on every `/rpc/*` request, safe methods included (the RPC transport POSTs reads too); anonymous
sessions validate against the stateless `__csrf` double-submit token. Anonymous public reads are exempt only when
`~orpc.meta.publicRead === true` (declared in `@kobato/api`, derived by `request/public-read-rpc-path.ts`). A separate
`csrfExempt` meta preserves exactly four legacy no-CSRF transports — the anonymous device beacon, the admin backup
download, and the two author music media GETs — with their role guards intact. Both sets are exact canonical-path,
frozen-key tested; eligibility is never inferred from the HTTP method. Everything else keeps the full guard.

### Contract-first procedures

- Domains declare `method`/`path`/`input`/`output` ONCE in `@kobato/api`; controllers implement through the
  `implement{Public,Authed,Author,Admin}` factories in `orpc-base.ts` (reference:
  `controllers/account/likes.controller.ts`). A limiter that must run BEFORE input parsing rides the implementer;
  `impl.router({...})` dedupes the shared leading guard.
- The `contract-implementation.ts` types make an unbranded contract fail closed: `.router()` accepts only a tree
  matching `ContractImplementation<typeof contract>` (every key, the exact input/output schema types, the branded
  `defineProcedure` method/path), and `apiRouter = { … } satisfies ContractImplementation<typeof apiContract>` closes
  the loop (compile-time twin of `tests/unit/server/http/api-contract.test.ts`; types pinned by
  `contract-implementation.test.ts`).
- Shared route-less factories stay generic over the host base path so the brand survives: `admin/revision-shared.ts`
  infers `TBase` from the host controller's `impl`; a non-generic `RevisionContract` widens every revision path to
  `` `/${string}/…` `` and breaks `adminPostsRouter`/`adminPagesRouter`.

### Adding an endpoint

- Schema in `@kobato/api/contracts/<group>/<domain>.ts` (never inline; vocabulary a second audience needs lives in the
  lower audience layer) → declare in `@kobato/api/rpc/<group>/` → implement on the right `implement*` base → register in
  `apiRouter` and in the group composition root in `@kobato/api`.
- `requestTimeoutMs`, `requestBodyLimit`, `installGateExempt`, and `telemetryExcluded` are declared on the procedure and
  derived through `@kobato/api/rpc/metadata` (`request/rpc-timeout-overrides.ts` builds the Hono timeouts from the full
  contract tree) — no parallel Hono/browser path lists.
- A multi-column field-update procedure MUST use `mergePatchInput` from `@kobato/api/contracts/primitives`
  (`clearable(...)` for nullable columns, `splitMergePatch(input)` in the handler) — pinned by
  `apps/kobato/tests/arch/merge-patch-controllers.test.ts`, reference `admin.users.update`. Full-record upserts,
  single-field setters, lifecycle actions, and the settings section merge are deliberately NOT merge-patch.

### Hono / oRPC rules

- No business logic in procedure handlers. Throw `ORPCError('CODE', { message })`; services never throw `HTTPException`.
- Error copy is a typed descriptor, not prose: producers throw `DomainError`/`ActionFailure` with an
  `ErrorMessageDescriptor` and the boundaries translate per request; `ORPCError.data` is `{ descriptor, issues }`, never
  a bare issue array. Un-migrated domains use the `error.api.rawMessage` passthrough.
- Client validation schemas carry a typed `UiMessageId` in `message`; the server maps Zod issues via
  `server/infra/http/error-descriptor`. Entity nouns cross as MACHINE kinds rendered by ICU `select`.
- Throws: perimeter middlewares `LocalizedHttpException`; direct controller throws `localizedOrpcError(...)`; resource
  routes `failureJsonResponse` / `errorJsonResponse`; worker isolates `WorkerDomainError` with the same descriptor.
  Ordinary `Error` is CLI-only; user-visible background failures carry descriptors. Settings strict patches reject
  unknown keys with `unrecognizedKeys`.
- No ad-hoc Hono command/query/upload/download routes bypassing `apiRouter`: first-party JSON, File/Blob, binary
  streams, and event iterators are oRPC procedures with a single flat input object. Only audited external-protocol,
  preserved-public-URL, and operational resources belong in `resources/` (OpenObserve RUM intake, Webmention,
  feeds/images/storage, health/readiness) — `apps/kobato/tests/arch/api-resource-surface.test.ts` pins the exact paths
  and browser callers.

## render/

SSR output products (`seo/`, `feed/`, `og/`, `calendar/`, `warmup/`, `canvas-fonts.ts`, `pretext-layout.ts`) produce
strings, `Buffer`s, or `Response`s and never persist.

- `feed`/`calendar` cache keys include locale + `APP_VERSION` + their SCOPE revision; their resources answer
  `public, no-cache` + byte-derived ETag + `Content-Language`. Feeds render the saved `bodyHtmlFeed` through
  `sanitizeFeedHtml`.
- Renderers receive the request context's PINNED `settings` bundle — never a second snapshot read. The sidebar's
  latest-comments digest and taxonomy lists read SQLite directly (indexed point reads, no bucket).
- Route prewarming: `tools/pack/src/vite/route-warmup.ts` tiers ~500 client chunks and `render/warmup/manifest.ts` emits
  critical preloads + idle tiers via inline script. Tier-2 buckets derive from route-ID prefixes; only `TIER1_ROUTES` is
  editorial (`apps/kobato/tests/unit/infra/route-warmup.test.ts`).

## Sessions & request context

One perimeter middleware derives the canonical `RequestContext` (session, viewer, address, normalized URL, db, CSP
nonce, pinned settings + localization); both getters share ONE lazy capture (`createLazyAppSnapshot`), and
`buildLoadContext` and the `/rpc/*` mount hydrate settings before first read. Same-session mutations call
`markSessionDirty()`; the middleware commits `Set-Cookie` after the response — the only commit point. `HandlerContext`
carries the same `markSessionDirty` plus a per-request `responseHeaders` for out-of-band headers (auth-flow cookies,
refreshed comment tokens), merged into the response by the `/rpc/*` mount and `createSsrCaller`.

## Databases

Two embedded engines, zero services:

- **Content DB** — SQLite (`node:sqlite` + drizzle) at `storage.database`, owned by `@kobato/db`. Server src NEVER
  imports `node:sqlite`/Drizzle, constructs SQL, or touches a native client: it passes the opaque
  `Database`/`DatabaseHandle` tokens to semantic `@kobato/db/sqlite/operations/*` (`sqliteOf`/`sqliteEngineOf` and
  `SqliteEngine` are db-plane only). Every transaction runs inside a db operation with sync callbacks
  (`db.transaction(async …)` is a compile error). Column modes `timestamp_ms` / `boolean` / `json`; `LIKE`, not `ILIKE`.
- **Analytics sidecar** — DuckDB at `storage.analyticsDatabase`, owned by `@kobato/db`. Server src NEVER imports
  `@duckdb/node-api`, `@duckdbfan/drizzle-duckdb`, or `drizzle-orm` and never runs DuckDB SQL: it holds only the opaque
  capabilities from `@kobato/db/duckdb/connection` (`AnalyticsWriter`, `AnalyticsReader` + `duckdb/queries/`,
  `AnalyticsQuery` via the executor seam) and the opaque `AnalyticsHandle` token in `bootstrap/analytics-lifecycle.ts`
  (lifecycle metadata `path`/`inMemory`/`closed` only); statements, CHECKPOINT included
  (`@kobato/db/duckdb/database::checkpointAnalyticsDatabase`), stay behind db operations. `access_events` uses the
  generic-column style (`blob5` = the daily-salted visitor hash; raw IPs are never persisted) plus the `device_env_*`
  sidecars keyed by event UUID. The single telemetry perimeter is
  `domains/analytics/services/analytics-sql.ts::runAnalyticsQuery`, registered through `setAnalyticsQueryExecutor` at
  boot; spans/metrics carry only the stable operation label, never SQL or parameters. Geo-unknown is excluded unless
  `includeUnknown: true`. The sidecar recreates empty when missing but is INCLUDED in backups; the storage format
  upgrades at open; legacy `access_log` migrates at boot.
- **Backup & restore** — `src/domains/backup/AGENTS.md`. The 30s global request timeout exempts the restore endpoints
  (30 min).
- **Page views** — `metric.pv` through the in-memory `PageViewBatcher` (flush on 50 bumps / 60s); reads merge
  `pendingViewDelta`. `trackPageView` is synchronous; every public document tracks exactly one view, a 304 never.
  `AccessLogBatcher` appends `{ event, envServer }` in one flush.
- **Env beacon intake** — `public.analytics.recordDeviceEnv` at `/rpc/public/analytics/recordDeviceEnv`: 4 KB cap,
  120/min per-IP, schema validation, then `DeviceEnvBeaconBatcher`. It is the only anonymous write in `csrfExempt` (so
  `sendBeacon` works without headers). Event ids are NOT checked against `access_events` (orphans drop at JOINs); the
  batcher pre-filters ids already in `device_env_client`.
- **Daily maintenance** (04:30 site TZ): SQLite `incremental_vacuum` + `optimize` + `job_run` pruning; DuckDB 180-day
  retention + `CHECKPOINT`; token purge. `ANALYZE` after every bulk load; both DuckDB mutation windows serialize on one
  lock. Crash-orphaned `job_run` `running` rows sweep to `failed` once at boot; other stored errors render verbatim.
- **Write batchers** (`infra/db/insert-batcher::FlushLoop`): a flush DRAINS; on failure the recovery policy owns the
  batch. `pause()/resume()` quiesce across the backup window; `settle()` joins an in-flight flush WITHOUT draining —
  always await it before closing DuckDB. Past 10_000 buffered events, incoming events are DROPPED and counted.

## Configuration & install gate

- Source of truth: the `setting` table, one JSON row per section; the 19 Section schemas/defaults live in
  `@kobato/settings/sections`, the server registry adds write validation. Adding a section = one shared Section module +
  one registry line.
- SSR reads via `requireBlogSettingsSection('<key>')`; UI uses per-section hooks and MUST NOT read the whole bundle.
- Install: `/admin/setup` creates the first admin and seeds defaults; `honoInstallGateMiddleware` gates on "has
  admin" == "installed".
- Admin saves: per-card Section patch; the server strict-checks keys, deep-merges, validates against the registry
  schema, and writes only that row.

## Content

- `post` → `/posts/:slug`; `page` → `/:slug`; both render the saved `bodyHtml` (NULL falls back to on-the-fly headless
  projection, `domains/content/services/body-html.ts::resolveBodyHtml`). `visible=false` posts stay in archives, tags,
  search, sitemap, and feeds; only home/random widgets exclude them.
- **Draft gate**: public-invisible when `status=draft` OR `publishedRevisionId=null`; every public query checks both via
  `domains/content/schemas/live-gate.ts` (`isLive` / `liveContentWhere`) — never hand-assemble.
- **Body projections**: the save pipeline (`domains/content/lifecycle.ts`) computes `bodyHtml` / `bodyText` /
  `bodyHtmlFeed` via `infra/lexical/`; failure is best-effort (warn + NULL). The dashboard rebuild button re-derives
  drifted rows only. Feeds render `bodyHtmlFeed`; search stores `bodyText`; webmention extraction walks the Lexical
  state; comment emails render the saved snapshot.
- **Slugs**: `infra/slug/derive::deriveSlug` (pinyin-pro → collapse → github-slugger); resolver `resolve::resolveSlug`.
  Validation stays server-side; fence + in-transaction reservation live in
  `@kobato/db/sqlite/operations/content/entity-meta`. Pages and posts share the `slug_registry` namespace;
  `rethrowSlugConflict` maps raced UNIQUE violations to 409.
- **Images**: bytes live in the active storage backend (`infra/storage/registry::activeBackend`) and each row persists
  `storageDriver`. Writes use `activeBackend()`, reads/deletes `backendFor(driver)`, fleet scans `allBackends()` — never
  import a backend directly (S3: `src/domains/storage/AGENTS.md`). Test seam: `__setStorageBackendForTests` /
  `__resetStorageBackendsForTests`. URL→meta resolution flows through `domains/images/services/resolve`.
- **Audit log**: every state-mutating admin operation and auth lifecycle event (read-only never), via
  `recordAuditEventFromContext` after the mutation succeeds. Names are kebab-case present-tense `<entity>_<verb>`.
  Retention: DB rows 30d, S3 archives 180d. Batcher 50 events / 500ms, flushed on SIGTERM/SIGINT/beforeExit.
