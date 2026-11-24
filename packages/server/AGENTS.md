# Server conventions

`packages/server/src/` (`@kobato/server`) is SSR-only: it imports `@kobato/db`, `@kobato/api`, the shared leaves, and
`@kobato/inkling` only through `/headless` — never `@kobato/web-*` or `@kobato/ui`. Six source roots, strict one-way
graph:

```
server/
├── assets/     # Static asset blobs + manifest (data, outside the layer graph).
├── bootstrap/  # Composition root: engine lifecycles and wire* seams.
├── infra/      # Technical primitives — zero business knowledge.
├── domains/    # Self-contained business modules (one folder per domain).
├── http/       # HTTP perimeter (oRPC + Hono).
└── render/     # SSR output products (HTML, RSS/Atom, OG, calendar, SEO).
```

`bootstrap/` is the only root allowed to know every layer; no other module imports it
(`apps/kobato/tests/arch/server-layers.test.ts`). `assets/` is static data outside the import graph. A file belongs to
exactly one root. Naming: `kebab-case.ts`/`.tsx`; entity domains plural, mass nouns singular; `*.controller.ts` is
reserved for router-owning controllers; every `http/loaders/*.ts` exports a loader.

## infra/

Pure primitives; imports nothing from `domains/`, `http/`, or `render/`. Details: `src/infra/AGENTS.md`.

- `db/` — persistence adapters only (paths, job-run-recorder, insert-batcher + batcher-registry, maintenance,
  query-diagnostics). Engines and schemas live in `@kobato/db`; `bootstrap/db-lifecycle.ts` wires them.
- `job-registry.ts` — jobs self-register `(name, nextDelayMs, run)` at import time; `startAllRegisteredJobs()` arms
  them. Timer mechanics stay in `scheduler-utils::scheduleJob`; a catalog `task: { key, recordHistory? }` adds live
  state and `job_run` history. `scheduleJob` owns the single `job.run` trace perimeter (name + task key only).
- `cache/` — `file-store` owns the on-disk plane (`<storage.data>/cache/<bucket>/<h[0:2]>/<h[2:]>`, `KBC1` envelope,
  `_generation` counters); `memory-store` is the process-local L1 (>64 KiB values and the `og`/`calendar` buckets never
  enter; a hit hands every caller the SAME object — cache results are read-only). `cache/registry` verbs take NO
  `Database`; `through` writes are fire-and-forget. L1 invalidation is synchronous and runs BEFORE the filesystem leg.
  Settings-derived render entries key on the section-scoped representation generation
  (`@kobato/settings/representation-scopes`); the boot-unique `AppLocalization.revision` never keys a cache.
- `http/` — `etag`, `headers`, `status`, `errors` (`DomainError`/`ActionFailure`), `email/`, `image/`, `crypto/`,
  `config.ts`, `i18n.ts`, `logger.ts`, `rate-limit.ts`, `slug/`, `data-paths.ts`, `sea/`. Post search is NOT infra
  (`domains/posts/services/search-query.ts`).
- `trace/` — `runtime.ts` and `logs-runtime.ts` are the ONLY modules importing `@opentelemetry/*`, reached through one
  dynamic import in `domains/observability/runtime-manager.ts`; a disabled/unverified config never constructs a provider
  (`apps/kobato/tests/arch/trace-sdk-boundary.test.ts`). Labels carry closed vocabularies only — never URL, host, query,
  SQL, parameters, keys, or payload. OpenObserve provisioning and `trace:smoke` live in `tools/trace/src/`.
- `email/` copy lives in the SERVER catalog; every template takes an explicit `t: ServerTranslator`. User-authored
  content is passed raw and never translated.
- `safe-fetch.ts` — THE outbound-fetch surface for user-influenced URLs (SSRF guard). `trustedOrigin` is the ONE
  private-network exemption (exact-match, admin-validated). Raw `fetch(` sites are pinned to an audited allowlist; logs
  use `redactUrlForLog`. `__setDnsLookupForTests` replaces DNS for tests that stub `fetch`; tests asserting the DNS
  guard mock `node:dns/promises` and must NOT set the seam.

## domains/

One folder per business domain; base vocabulary `schema.ts / repo.ts / service.ts / projection.ts / cache.ts` plus
feature files. Once a subdirectory exists (`services/`, `repos/`), the root file MUST NOT coexist.

- Domains import `infra/`, the shared leaves, and other `domains/` — acyclically; cycles resolve through an injected
  parameter wired by the caller. A domain's `repos/**` is private — cross-domain consumers import the surface
  (`apps/kobato/tests/arch/server-public-surface.test.ts`).
- Three strata: **Core** (`content`, `posts`, `pages`, `settings`), **Feature** (`auth`, `users`, `comments`,
  `taxonomies`, `images`, `assets`, `fonts`, `music`, `friends`, `newsletter`, `webmentions`, `notifications`),
  **Platform** (`analytics`, `audit`, `backup`, `update`, `storage`). Platform services are leaves. Dedicated docs:
  `fonts`, `storage`, `backup`. `update/` MUST close the listen socket before spawning the replacement
  (`job.ts::scheduleSelfRestart`).
- `notifications/` — rows fan out at creation into `notification_recipient` (unread = `readAt IS NULL`). Kinds: `direct`
  (always replyable), `admin` (never replyable), `broadcast` (replyable by NON-ADMIN recipients only). A reply to a
  replyable broadcast FORKS a new `direct` thread to all current admins; reads/replies gate on `isThreadParticipant`
  (LIMIT-1 probes). Recall is a soft delete (`recalled_at` stamped only where NULL; audits fire only on the first call;
  every read filters `recalled_at IS NULL`). Email is fire-and-forget AFTER `createAndFanOut` in the `direct`/`admin`
  producers, gated by `mail.enabled` AND `mail.notificationEmails`; broadcasts never email; maintenance prunes READ rows
  and orphan roots at 180 days. `admin`-kind rows store the English fallback plus a nullable i18n descriptor; persisted
  keys are append-only; every read resolves through `domains/notifications/message.ts`.
- Outbound webmentions are `webmention_outbox` rows (UNIQUE(source,target)) run by a sequential single-worker loop: 5
  rows/wake, 5 attempts with backoff capped at 12h, ≥1s apart. Scheduled posts wait for their publish instant; a later
  republish only raises `nextRetryAt`; `sent` rows never re-send.

## http/

HTTP perimeter only: `orpc-base.ts`, `contract-implementation.ts`, `request-context.ts`, `hono-env.ts`, `api-router.ts`,
`errors.ts`, `app.ts`, `orpc-trace.ts`, `middlewares/`, `controllers/` (mirroring the router groups: `public/`,
`account/`, `admin/`), `resources/`, `loaders/`, `route-cache-headers.ts`, `request/`, `ssr-caller.ts`. Controllers and
loaders **orchestrate only** — logic stays in `domains/<x>/service.ts`. `controllers/**` mirrors the `apiRouter` groups
one-to-one (`apiRouter.public.comments` ⇔ `controllers/public/comments-*.controller.ts`); route-less shared factories
are the only exception (`admin/revision-shared.ts`, `account/auth-shared.ts`). `apiRouter` mirrors the three-group
contract tree exactly (`public` / `account` / `admin`); the account self procedures spread at the `account` root (so
`account.profile` etc. keep their keys — `/rpc/account/*` never moved).

Two URL surfaces, never conflated: (1) the **route method/path metadata** from `@kobato/api` — the REST-style
compatibility record, never a mounted REST surface; `admin.analytics` keeps its legacy `/analytics/*` route metadata
(the one non-`/admin/` admin prefix). (2) the **`/rpc/*` transport URLs** — oRPC's `RPCHandler` derives them from the
ROUTER TREE KEYS, so the grouped tree answers at `/rpc/public/...` / `/rpc/account/...` / `/rpc/admin/...` (canonical).
The canonical grouped paths are the ONLY transport: `app.ts` hands `c.req.raw` straight to the handler, and every caller
— in-repo and headless alike (`createKobatoPublicClient`) — uses them; the pre-grouping alias adapter was removed
(ADR-0009 §5).

### Sign-in & install flows (`account.auth.*` / `account.setup.*`)

`controllers/account/auth.controller.ts` owns the whole signin orchestration over the auth domain services (the former
`http/loaders/signin.ts` is gone): `status` (view/redirect union: logged-in redirect, reset/invite/magic token peek, OTP
pending/expired + `markSessionDirty`, csrf token), `identify`, `login`, `logout`, `magicLink`, OTP verify/resend/cancel,
and password reset (+ author invite); `passkey.authFinish` lives in the passkey controller.
`controllers/account/setup.controller.ts` mirrors that for install: `status` (mint-or-read setup token + session
projection), `verifyToken` (keyed rate limit — the 429 rides the wire error variant —, session flag +
`markSessionDirty`), and `install` (session/token gates, `signUpAdminSchema` safeParse so field copy stays
`auth.setup.error.*` descriptors, `signUpInitialAdminWithSession`). All are `implementPublic` — anonymous ceremonies
with their own rate limits; HTTP calls still pay the global `csrfGuard` (none of them carries the `publicRead`
declaration, so none joined the public-read exemption). Typed camelCase inputs are adapted to `FormData` (auth) or the
domain schema (setup) so the services keep owning user-visible error copy — the wire input schemas are deliberately
permissive. Controllers re-validate every `redirectTo` with `safeRedirectPath` themselves (action fallback
`AUTH_ACTION_REDIRECT_FALLBACK`, status fallback `AUTH_STATUS_REDIRECT_FALLBACK`, both declared in
`@kobato/api/contracts/account/auth`) — never trust a route-side sanitization. Internal `setCookie` values move from
`AuthFlowResult` onto `context.responseHeaders` (`wireAuthFlow`) and never appear in the wire output; the `/rpc` mount
and `createSsrCaller` both surface them as real `Set-Cookie` headers — the same cookie reaches HTTP RPC clients and the
in-process React Router action.

- Error translation seam: `errors.ts` (vocabulary), `translate-domain-error.ts` (domain error → `ORPCError`),
  `localized-http-exception.ts` + `leaked-response.ts`.
- `orpc-trace.ts` is the oRPC transport seam (`/rpc/*` + in-process `ssr-caller`); spans carry the stable procedure
  path; input is never recorded.
- `buildCspHeader` is the single dynamic-CSP owner and NEVER widens `connect-src`. The browser SDK posts RUM to the
  same-origin relay `POST /api/rum/intake/rum/v1/<org>/rum` (`http/resources/rum-intake.ts`), mounted in EVERY build
  beside the `public.observability.rumStatus` procedure — both install-gate-exempt and trace-excluded. Intake
  caps/limits stay in the external resource; status is an anonymous `publicRead` RPC. The OpenObserve origin appears in
  no policy, document, or CORS entry.

### Public content API (`public.content.*`)

- The public read-only contract is the `public.content.*` group (Ghost-Content-API style), implemented by
  `controllers/public/content-*.controller.ts`, schemas in `@kobato/api/contracts/public/content.ts`. Admin SSR lives in
  the domain groups; there is deliberately NO page-level aggregate group — loaders compose domain endpoints.
- Public route loaders and the root loader consume `public.content.*` through `createSsrCaller` (`ssr-caller.ts`) —
  in-process, no HTTP hop; it also owns `unwrapListing`/`unwrapDetail`.
- `loaders/*` are the orchestration layer (`listing`, `search`, `sidebar`, `comments`, `detail-critical` + the
  `page-preview` / `post-detail` / `home` pipelines); pipelines signal 301/302/404 by throwing `Response`s mapped by
  `http/content-signals.ts`.
- Detail revalidation: `content-detail.controller.ts` assembles the payload, fingerprints it (`postEtag`/`pageEtag`),
  answers `not-modified` only then; draft previews carry `etag: null`. Listings fingerprint with `listingEtag`
  (locale/zone/format + revisions + `APP_VERSION` + calendar day) and record a page view only for a served document. The
  sidebar "random" widgets are DETERMINISTIC per representation (seeded shuffle — never a per-request CSPRNG, it would
  break the ETag).
- `public.content.bootstrap` takes no input: theme cookie + message scope resolved inside, Inkling labels only for
  signed-in workspace documents, `observability` dropped from the anonymous projection.

### Base procedures

| Base         | Guard                                 | Use for                    |
| ------------ | ------------------------------------- | -------------------------- |
| `publicProc` | No auth gate; `csrfGuard`             | Anonymous + CSRF mutations |
| `authedProc` | `requireAuth` + `csrfGuard`           | Any logged-in user         |
| `authorProc` | `requireRole('author')` + `csrfGuard` | Authors and admins         |
| `adminProc`  | `requireRole('admin')` + `csrfGuard`  | Admins only                |

`csrfGuard` runs on every `/rpc/*` request — safe methods included (the RPC transport POSTs reads too); anonymous
sessions validate against the stateless `__csrf` double-submit token. Anonymous public reads are exempt only when
`~orpc.meta.publicRead === true`, declared in `@kobato/api` and derived by `request/public-read-rpc-path.ts`. A separate
`csrfExempt` meta preserves the four legacy no-CSRF transports: the anonymous device beacon plus admin backup download
and the two author music media GETs (their role guards still run). Both sets are exact canonical-path, frozen-key
tested; eligibility is never inferred from HTTP method. Every other mutation, token read, and account/admin procedure
keeps the full guard.

### Contract-first procedures

Domains declare `method`/`path`/`input`/`output` ONCE in `@kobato/api`; controllers implement through the
`implement{Public,Authed,Author,Admin}` factories in `orpc-base.ts` (reference:
`controllers/account/likes.controller.ts`). A limiter that must run BEFORE input parsing rides the implementer;
`impl.router({...})` dedupes the shared leading guard. The implementer types come from `contract-implementation.ts`:
each `implement*` returns a `ContractImplementer`, whose leaf `.handler()` result carries the contract's route brand
(`defineProcedure` in `@kobato/api`) through `.use()`, and whose `.router()` only accepts a tree matching
`ContractImplementation<typeof contract>` — every key, the exact input/output schema types, and the branded method/path.
`apiRouter` closes the loop with `apiRouter = { … } satisfies ContractImplementation<typeof apiContract>` (compile-time
twin of the runtime parity test `tests/unit/server/http/api-contract.test.ts`; `contract-implementation.test.ts` pins
the types, positive and fail-closed negative). Plain `oc.route` contracts carry no brand and FAIL CLOSED: an unbranded
leaf makes `ContractImplementation` demand the unsatisfiable `UnbrandedContractRoute` brand, so neither `impl.router()`
nor the `apiRouter` satisfies accepts it — every production contract procedure is declared with `defineProcedure`, and
`@kobato/api/rpc/define-procedure.ts` is the single `oc.route` call site in `@kobato/api`'s `src/rpc/`. Shared
route-less factories must stay generic over the host base path so the brand survives: `admin/revision-shared.ts` infers
`TBase` from the host controller's `impl` (`RevisionRouterImplementer<TBase>` over `RevisionContract<TBase>`); a
non-generic `RevisionContract` widens every revision path to `` `/${string}/…` `` and
`adminPostsRouter`/`adminPagesRouter` stop satisfying their contracts.

### Adding an endpoint

- Schema in `@kobato/api/contracts/<group>/<domain>.ts` (never inline — vocabulary a second audience needs lives in the
  lower audience layer, e.g. `admin/` reuses `public/` and `account/`); declare in the domain's
  `@kobato/api/rpc/<group>/` module; implement with the right `implement*` base; register in `apiRouter` under the
  matching group (`public` / `account` / `admin`) and the group composition root in `@kobato/api`. Long-running
  procedures declare `requestTimeoutMs` in the same metadata; `request/rpc-timeout-overrides.ts` derives the Hono
  timeout overrides from the full contract tree rather than maintaining a second path table. `requestBodyLimit`,
  `installGateExempt`, and `telemetryExcluded` are likewise declared on the procedure and derived through
  `@kobato/api/rpc/metadata`; no parallel Hono/browser path lists.
- A multi-column field-update procedure MUST use `mergePatchInput` from `@kobato/api/contracts/primitives` —
  `clearable(...)` for nullable columns, `splitMergePatch(input)` in the handler (pinned by
  `apps/kobato/tests/arch/merge-patch-controllers.test.ts`; reference `admin.users.update`). Full-record upserts,
  single-field setters, lifecycle actions, and the settings section merge are deliberately NOT merge-patch.

### Hono / oRPC rules

- No business logic inside procedure handlers. Throw `ORPCError('CODE', { message })`; services never throw
  `HTTPException`.
- Error copy is a typed descriptor, not prose: producers throw `DomainError`/`ActionFailure` with an
  `ErrorMessageDescriptor`; the boundaries translate per request. `ORPCError.data` is `{ descriptor, issues }` (never a
  bare issue array). Un-migrated domains use the `error.api.rawMessage` passthrough.
- Client validation schemas carry a typed `UiMessageId` in `message`; the server maps Zod issues via
  `server/infra/http/error-descriptor`. Entity nouns cross as MACHINE kinds rendered by ICU `select`.
- Perimeter middlewares throw `LocalizedHttpException`; direct controller throws use `localizedOrpcError(...)`; resource
  routes use `failureJsonResponse` / `errorJsonResponse`; a worker isolate throws `WorkerDomainError` carrying the same
  descriptor. Ordinary `Error` is CLI-only; user-visible background failures carry descriptors. Settings strict patches
  reject unknown keys with `unrecognizedKeys`.
- No ad-hoc Hono command/query/upload/download routes bypassing `apiRouter`; first-party JSON, File/Blob, binary
  streams, and event iterators are all oRPC procedures. Only audited external-protocol, preserved-public-URL, and
  operational resources belong in `resources/` (OpenObserve RUM intake, Webmention, feeds/images/storage,
  health/readiness). `apps/kobato/tests/arch/api-resource-surface.test.ts` pins the exact paths and browser callers.
  Procedure inputs are a single flat object.

## render/

SSR output products: `seo/`, `feed/`, `og/`, `calendar/`, `warmup/`, plus `canvas-fonts.ts` and `pretext-layout.ts` at
the root. Produces strings, `Buffer`s, or `Response`s; never persists.

- `feed`/`calendar` cache keys include locale + `APP_VERSION` + their SCOPE revision; their resources answer
  `public, no-cache` + byte-derived ETag + `Content-Language`. Feeds render the saved `bodyHtmlFeed` through
  `sanitizeFeedHtml`.
- Renderers receive the request context's PINNED `settings` bundle — never a second snapshot read. The sidebar's
  latest-comments digest and taxonomy lists read SQLite directly (indexed point reads, no bucket).
- Route prewarming: `tools/pack/src/vite/route-warmup.ts` tiers ~500 client chunks; `render/warmup/manifest.ts` emits
  critical preloads, idle tiers via inline script. Tier-2 buckets derive from route-ID prefixes; only `TIER1_ROUTES` is
  editorial (`apps/kobato/tests/unit/infra/route-warmup.test.ts`).

## Sessions & request context

One perimeter middleware derives the canonical `RequestContext` (session, viewer, address, normalized URL, db, CSP
nonce, pinned settings + localization). Both getters share ONE lazy capture (`createLazyAppSnapshot`);
`buildLoadContext` and the `/rpc/*` mount hydrate settings before first read. Same-session mutations call
`markSessionDirty()`; the middleware commits `Set-Cookie` after the response — the only commit point. `HandlerContext`
carries the same `markSessionDirty` plus a per-request `responseHeaders` — controllers stage out-of-band headers there
(session cookies from auth flows, refreshed comment tokens) and the `/rpc/*` mount / `createSsrCaller` merge them into
the outgoing response.

## Databases

Two embedded engines, zero services:

- **Content DB** — SQLite via `node:sqlite` + drizzle at `storage.database`, owned entirely by `@kobato/db`: server src
  NEVER imports `node:sqlite`/Drizzle, constructs SQL, or touches a native client. Server code holds the opaque
  `Database`/`DatabaseHandle` tokens and calls semantic `@kobato/db/sqlite/operations/*`; `sqliteOf`/`sqliteEngineOf`
  and the `SqliteEngine` anatomy are db-plane only. Every transaction executes inside a db operation with sync callbacks
  (`db.transaction(async …)` is a compile error). Column modes `timestamp_ms` / `boolean` / `json`; `LIKE`, not `ILIKE`.
- **Analytics sidecar** — DuckDB at `storage.analyticsDatabase`, owned entirely by `@kobato/db`: server src NEVER
  imports `@duckdb/node-api`, `@duckdbfan/drizzle-duckdb`, or `drizzle-orm` and never runs DuckDB SQL. `access_events`
  uses the generic-column style (blob semantics in the `blobsMap` in `@kobato/db/duckdb/access-events` — `blob5` is the
  daily-salted visitor hash, raw IPs never persisted) plus the `device_env_*` sidecars keyed by the event UUID. Server
  code carries only the opaque capabilities from `@kobato/db/duckdb/connection` (`AnalyticsWriter` for appends/dedup
  probes, `AnalyticsReader` + the `duckdb/queries/` modules for reads, `AnalyticsQuery` through the executor seam) and
  the opaque `AnalyticsHandle` engine token in `bootstrap/analytics-lifecycle.ts` (lifecycle metadata
  `path`/`inMemory`/`closed` only — no native connection fields; lifecycle/adopt wiring passes it straight into db
  operations); statements (including CHECKPOINT via `@kobato/db/duckdb/database::checkpointAnalyticsDatabase`) stay
  behind db operations. The single telemetry perimeter is
  `domains/analytics/services/analytics-sql.ts::runAnalyticsQuery`, registered into db through
  `setAnalyticsQueryExecutor` at boot — spans/metrics carry only the stable operation label, never SQL or parameters.
  Geo-unknown excluded unless `includeUnknown: true`. The sidecar recreates empty when missing but is INCLUDED in
  backups; storage-format upgrade happens at open; legacy `access_log` migrates at boot.
- **Backup & restore** — `src/domains/backup/AGENTS.md`. The 30s global request timeout exempts the restore endpoints
  (30 min).
- **Page views** — `metric.pv` through the in-memory `PageViewBatcher` (flush on 50 bumps / 60s); reads merge
  `pendingViewDelta`. `trackPageView` is synchronous; every public document tracks exactly one view, a 304 never.
  `AccessLogBatcher` appends `{ event, envServer }` in one flush.
- **Env beacon intake** — `public.analytics.recordDeviceEnv` at `/rpc/public/analytics/recordDeviceEnv`: 4 KB cap,
  120/min per-IP, schema validation, then `DeviceEnvBeaconBatcher`. It is the only anonymous write in the explicit
  `csrfExempt` set, preserving `sendBeacon` without headers. Event ids are NOT checked against `access_events` (orphans
  drop at JOINs); the batcher pre-filters ids already in `device_env_client`.
- **Daily maintenance** (04:30 site TZ): SQLite `incremental_vacuum` + `optimize` + `job_run` pruning; DuckDB 180-day
  retention + `CHECKPOINT`; token purge. `ANALYZE` after every bulk load; both DuckDB mutation windows serialize on one
  lock. Crash-orphaned `job_run` `running` rows sweep to `failed` once at boot; other stored errors render verbatim.
- **Write batchers** (`infra/db/insert-batcher::FlushLoop`): a flush DRAINS; on failure the recovery policy owns the
  batch. `pause()/resume()` quiesce across the backup window; `settle()` joins an in-flight flush WITHOUT draining —
  always await it before closing DuckDB. Past 10_000 buffered events, incoming events are DROPPED and counted.

## Configuration & install gate

- Source of truth: the `setting` table — one JSON row per section; the 19 Section schemas/defaults live in
  `@kobato/settings/sections`, the server registry adds write validation. Adding a section = one shared Section module +
  one registry line.
- SSR reads via `requireBlogSettingsSection('<key>')`; UI uses per-section hooks. New UI MUST NOT read the whole bundle.
- Install: `/admin/setup` creates the first admin and seeds defaults; `honoInstallGateMiddleware` gates on "has
  admin" == "installed".
- Admin saves: per-card Section patch; server strict-checks keys, deep-merges, validates against the registry schema,
  writes only that row.

## Content

### Posts and pages

- `post` → `/posts/:slug`; `page` → `/:slug`; both render the saved `bodyHtml` (NULL falls back to on-the-fly headless
  projection, `domains/content/services/body-html.ts::resolveBodyHtml`). `visible=false` posts stay in archives, tags,
  search, sitemap, feeds — only home/random widgets exclude them.
- **Draft gate**: public-invisible when `status=draft` OR `publishedRevisionId=null`; all public queries check both via
  `domains/content/schemas/live-gate.ts` (`isLive` / `liveContentWhere`) — never hand-assemble.
- **Body projections**: the save pipeline (`domains/content/lifecycle.ts`) computes `bodyHtml` / `bodyText` /
  `bodyHtmlFeed` via `infra/lexical/`; failure is best-effort (warn + NULL). The dashboard rebuild button re-derives
  drifted rows only. Feeds render `bodyHtmlFeed`; search stores `bodyText`; webmention extraction walks the Lexical
  state; comment emails render the saved snapshot.

### Slug derivation

Canonical: `infra/slug/derive::deriveSlug` (pinyin-pro → collapse → github-slugger); resolver `resolve::resolveSlug`;
validation stays server-side, while fence + in-transaction reservation lives in
`@kobato/db/sqlite/operations/content/entity-meta`. Page ↔ post slugs share the `slug_registry` namespace;
`rethrowSlugConflict` maps raced UNIQUE violations to 409.

### Images

Bytes in the active storage backend (`infra/storage/registry::activeBackend`); each row persists `storageDriver`. Writes
use `activeBackend()`, reads/deletes `backendFor(driver)`, fleet scans `allBackends()` — never import a backend
directly. S3 details: `src/domains/storage/AGENTS.md`. Test seam: `__setStorageBackendForTests` /
`__resetStorageBackendsForTests`. URL→meta resolution flows through `domains/images/services/resolve`.

### Audit log

Every state-mutating admin operation and auth lifecycle event (read-only never), via `recordAuditEventFromContext` after
the mutation succeeds. Naming: kebab-case present-tense `<entity>_<verb>`. Retention: DB rows 30d, S3 archives 180d.
Batcher 50 events / 500ms, flushed on SIGTERM/SIGINT/beforeExit.

## Layering constraints

- `infra/*` imports nothing from `domains/`, `http/`, or `render/`.
- `domains/*` imports nothing from `bootstrap/*` — wiring goes through `wire*` seams. Background jobs are the exception
  (self-register on `infra/job-registry`).
- `http/controllers/*` and `http/loaders/*` orchestrate only; `render/*` never persists.
- `drizzle-orm` remains a devDependency only for test seed/assertion helpers; no production source may import it or any
  other persistence driver/unwrap seam.
- No barrel `index.ts` files; no `*.server.ts` suffix.
