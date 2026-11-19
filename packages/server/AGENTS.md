# Server conventions

`packages/server/src/` (`@kobato/server`) is SSR-only: it imports `@kobato/db`, `@kobato/api` (the contract-first surface controllers implement), all thirteen shared leaves, and itself — never any `@kobato/web-*` package or `@kobato/ui`, and `@kobato/inkling` only through `@kobato/inkling/headless`. Six source roots, strict one-way import graph:

```
server/
├── assets/     # Static asset blobs + their manifest (data, outside the layer graph).
├── bootstrap/  # Composition root: engine lifecycles and wire* seams.
├── infra/      # Technical primitives — zero business knowledge.
├── domains/    # Self-contained business modules (one folder per domain).
├── http/       # HTTP perimeter (oRPC + Hono).
└── render/     # SSR output products (HTML, RSS/Atom, OG, calendar, SEO).
```

`bootstrap/` is the only root allowed to know every layer, and no other module imports it (`apps/kobato/tests/arch/server-layers.test.ts`). `assets/` holds the bundled default favicons/logos and their `defaults.ts` manifest — static data, deliberately outside the import graph. A file belongs to exactly one root.

Naming: `kebab-case.ts` / `.tsx`; entity domains plural (`posts`, `comments`), mass nouns singular (`content`, `music`, `analytics`, `settings`, `storage`, `cache`); `*.controller.ts` is reserved for router-owning controllers; a `*.ts` under `http/loaders/` must export a loader.

## infra/

Pure primitives; imports nothing from `domains/`, `http/`, or `render/`. Config file and SEA runtime contracts: `src/infra/AGENTS.md`.

- `db/` — persistence adapters only: `paths.ts` (both engine paths), `job-run-recorder.ts`, `insert-batcher` + `batcher-registry` (process-level write batchers), `maintenance.ts` (daily vacuum/optimize), `query-diagnostics.ts`. The drivers, schemas, and the DuckDB persistence layer live in `@kobato/db`; `bootstrap/db-lifecycle.ts` only wires them.
- `job-registry.ts` — background jobs self-register `(name, nextDelayMs, run)` at import time; one `startAllRegisteredJobs()` arms them all. Adding a timer means editing only its own module. Timer mechanics stay in `scheduler-utils::scheduleJob`; a catalog `task: { key, recordHistory? }` adds live state and `job_run` history. `scheduleJob` owns the single `job.run` trace perimeter (name + task key only, no payload).
- `cache/` — `file-store` owns the on-disk plane (`<storage.data>/cache/<bucket>/<h[0:2]>/<h[2:]>`, `KBC1` envelope, `_generation` counters); `memory-store` is the process-local L1 (per-bucket LRU bounded on entry count and bytes; >64 KiB values and the `og`/`calendar` buckets never enter; decoded values; a memory hit hands every caller the SAME object — cache results are read-only by contract). `cache/registry` is the behavior plane: verbs take NO `Database`, `through` writes are fire-and-forget, and the `cache.lookup` span records only bucket/result labels.
- L1 invalidation is synchronous and runs BEFORE the filesystem leg (`clear`, `clearLocalizedOutputs`, admin `clearBucket`, `wipeCacheForRestore`). Process-local is sound: the SEA deployment is a single process. Admin clear of the counter bucket bumps and persists `_generation` before dropping shards, so late writers stay unreachable.
- Settings-derived render entries key on the SECTION-SCOPED representation generation (`@kobato/settings/representation-scopes`); the boot-unique `AppLocalization.revision` never keys a cache. Unrelated saves move nothing; correctness never depends on the delete or on waiting for in-flight renders — a render started before the save writes its own old-generation key.
- `http/` — `etag`, `headers`, `status`, `errors` (`DomainError`/`ActionFailure`), `email/`, `image/` (worker_threads pool), `crypto/`, `config.ts` + `config-arg.ts`, `i18n.ts` (server translator, cached per locale), `logger.ts`, `rate-limit.ts`, `slug/`, `data-paths.ts` (fonts/maxmind/dead-letter layout), `sea/` (runtime + CLI probes). Post search is NOT infra — it lives in `domains/posts/services/search-query.ts`.
- `trace/` — OpenObserve tracing/metrics/logs, configured ONLY in the `observability` settings section. `runtime.ts` and `logs-runtime.ts` are the ONLY modules allowed to import `@opentelemetry/*`, reached through one dynamic import in `domains/observability/runtime-manager.ts`; a disabled/unverified config never constructs a provider (`apps/kobato/tests/arch/trace-sdk-boundary.test.ts`). Labels carry closed operation names/methods/statuses only — never URL, host, query, SQL, parameters, keys, or payload content. Local OpenObserve provisioning and `trace:smoke` live in `tools/trace/src/`.
- `email/` copy lives in the SERVER catalog (`messages/server/*`); every template takes an explicit `t: ServerTranslator` prop (`emailTranslator()` resolves the site locale at send time). USER-AUTHORED content (comment bodies, post titles, music metadata, direct/broadcast titles) is passed raw and never translated; system notifications render their i18n descriptor.
- `safe-fetch.ts` — THE outbound-fetch surface for user-influenced URLs (SSRF guard: http(s) only, port allowlist, per-hop DNS-rebinding-validating dial, host revalidation per redirect, byte caps). A `trustedOrigin` option is the ONE private-network exemption (exact-match, admin-validated endpoint). Wrapped in one `http.client` span with only a closed `operation` label. Raw `fetch(` sites are pinned to an audited allowlist; logs use `redactUrlForLog`.

## domains/

One folder per business domain. Base vocabulary: `schema.ts / repo.ts / service.ts / projection.ts / cache.ts` plus feature-named files. Once a subdirectory exists (`services/`, `repos/`), the root file MUST NOT coexist.

- Domains may import `infra/`, the shared leaves, and other `domains/` — acyclically. When composition would close a cycle, the consumer declares an injected parameter and the caller wires it. A domain's `repos/**` is **private** — cross-domain consumers import the surface only.
- Three strata: **Core** (`content`, `posts`, `pages`, `settings`), **Feature** (`auth`, `users`, `comments`, `taxonomies`, `images`, `assets`, `fonts`, `music`, `friends`, `newsletter`, `webmentions`, `notifications`), **Platform** (`analytics`, `audit`, `backup`, `update`, `storage`). Platform services are leaves — cross-domain imports INTO them compose at the perimeter. Dedicated docs: `fonts`, `storage`, `backup` (each `src/domains/<x>/AGENTS.md`). `update/` MUST close the listen socket before spawning the replacement (`job.ts::scheduleSelfRestart`).
- `notifications/` — `notification` rows fan out at creation into `notification_recipient` (unread = `readAt IS NULL`; later-registered users never see historical broadcasts). Kinds: `direct` (always replyable), `admin` (system → all admins, never replyable), `broadcast` (admin→all can be replyable by NON-ADMIN recipients only). A reply to a replyable broadcast FORKS a new `direct` thread delivered to all current admins; thread reads/replies are gated by `isThreadParticipant` (LIMIT-1 probes — never materialize a broadcast-sized audience).
- Recall is a soft delete: `recallNotification` stamps `recalled_at` only where NULL (idempotent); `recallMessage` refuses `direct` messages; audits fire ONLY on the first call. Every read path filters `recalled_at IS NULL`; forked direct threads stay readable and replyable.
- Email delivery is fire-and-forget AFTER `createAndFanOut` in the `direct`/`admin` producers only (`email.ts::queueNotificationEmail`), gated by `mail.enabled` AND `mail.notificationEmails`; broadcasts never email. The maintenance job prunes READ recipient rows and orphan roots at 180 days — unread rows are never pruned. System-notification i18n: an `admin`-kind row stores the English fallback plus a nullable descriptor (`title_key`/`title_params`, `body_key`/`body_params`); persisted keys are append-only; every read path resolves through `domains/notifications/message.ts` with the reader/send locale, falling back to stored English.

## http/

HTTP perimeter only: `orpc-base.ts`, `request-context.ts`, `hono-env.ts`, `api-router.ts`, `errors.ts`, `app.ts`, `orpc-trace.ts`; `middlewares/`; `controllers/` (admin under `controllers/admin/`); `resources/` (non-JSON); `loaders/`; `route-cache-headers.ts`; `request/`; `ssr-caller.ts`. Controllers and loaders **orchestrate only** — business logic stays in `domains/<x>/service.ts`.

Error translation is a three-file seam: `errors.ts` (vocabulary), `translate-domain-error.ts` (domain error → `ORPCError`), `localized-http-exception.ts` + `leaked-response.ts` (localized failures and the redacted fallback). `controllers/**` mirrors the `apiRouter` groups one-to-one (`<domain>.controller.ts`); shared factories that own no route are the only exception (`admin/revision-shared.ts`), and new exceptions need a line here.

- `orpc-trace.ts` is the oRPC transport seam (HTTP `/rpc/*` + in-process `ssr-caller`); spans carry the stable procedure path; input is never recorded.
- `buildCspHeader` is the single dynamic-CSP owner and NEVER widens `connect-src`. The browser SDK posts RUM to the same-origin relay `POST /api/rum/intake/rum/v1/<org>/rum` (`http/resources/rum-intake.ts`), so the OpenObserve origin appears in no policy, document, or CORS entry. The relay is mounted in EVERY build next to `/api/rum/status` (both exempt from the install gate, excluded from HTTP traces and RUM activity): it fail-closed-validates the sub-path shape against the verification gate, caps query (4 KiB) and body (1 MiB), rate-limits per IP (240/min), deletes every inbound `o2-api-key`, appends the real RUM client token, forwards via `safeFetch`, answers 202 or a detail-free 502 — never a URL/token in a log. `/api/rum/status` answers `{enabled:false}` before setup; both support runtime drift both ways.

### Public content API (`content.*`) and admin domain API

- The public read-only contract is the `content.*` group (Ghost-Content-API style) implemented by `controllers/content-*.controller.ts`, schemas in `@kobato/contracts/content.ts`. The admin SSR surface lives in the domain groups (`account.*`, `comments.*`, `analytics.*`, `admin.*`); there is deliberately NO page-level aggregate group — loaders compose domain endpoints themselves.
- Public route loaders and the root loader consume `content.*` through `createSsrCaller` (`ssr-caller.ts`) — the router runs in-process against a `HandlerContext` projected from the canonical `RequestContext`; no HTTP hop. `ssr-caller.ts` also owns `unwrapListing`/`unwrapDetail`.
- `loaders/*` helpers are the orchestration layer: `listing`/`search`/`sidebar`/`comments`/`detail-critical` plus the pipelines `page-preview`, `post-detail` (draft fallback, canonical 301), and `home` (`loadHomeData`). Pipelines signal 301/302/404 by throwing `Response`s, mapped by `http/content-signals.ts`.
- Detail revalidation: `content-detail.controller.ts` assembles the whole payload, fingerprints it (`postEtag`/`pageEtag`), answers `not-modified` only then; draft previews carry `etag: null`, never 304'd. The streamed comment rows' public-DTO digest is part of `critical`, so comment changes invalidate the document ETag. Listing procedures fingerprint with `listingEtag` (locale/zone/format + `localization.revisions.listing` + `APP_VERSION` + the site calendar day) and record the page view ONLY for a served document.
- Both "random" sidebar widgets are DETERMINISTIC per representation: `selectSidebarPosts`/`selectSidebarTags` sample with a seeded shuffle over scope + calendar day + settings revision. Never reintroduce a per-request CSPRNG draw — it would make the ETag unmatchable.
- `content.bootstrap` takes no input: it parses the theme cookie, derives the message scope from the path (`/admin` + `/editor` → full catalog, else the `PUBLIC_MESSAGE_PREFIXES` allowlist), ships Inkling labels only for signed-in workspace documents, and drops the admin-only `observability` section from the anonymous document projection.

### Base procedures

| Base         | Guard                                 | Use for                    |
| ------------ | ------------------------------------- | -------------------------- |
| `publicProc` | No auth gate; `csrfGuard`             | Anonymous + CSRF mutations |
| `authedProc` | `requireAuth` + `csrfGuard`           | Any logged-in user         |
| `authorProc` | `requireRole('author')` + `csrfGuard` | Authors and admins         |
| `adminProc`  | `requireRole('admin')` + `csrfGuard`  | Admins only                |

`csrfGuard` runs on EVERY `/rpc/*` request — safe methods included; anonymous sessions validate against the stateless `__csrf` double-submit token.

### Contract-first procedures

Domains declare `method`/`path`/`input`/`output` ONCE in `@kobato/api`; the controller implements them through the `implement{Public,Authed,Author,Admin}` factories in `orpc-base.ts` — the exact counterparts of the four bases, so middleware order, `HandlerContext`, auth, CSRF, and tracing stay server-side and identical. Reference implementation: `controllers/likes.controller.ts`; every non-admin controller follows it. A limiter that must run BEFORE input parsing rides the implementer itself; a guard that sat after `.input()`/`.output()` attaches per procedure. The controller's final `impl.router({...})` dedupes the shared leading guard.

### Adding an endpoint

- Schema in `@kobato/contracts/<domain>.ts` (never inline in a controller); declare the procedure in the domain's `@kobato/api` module, implement it with the right `implement*` base, and register the controller in `apiRouter` / `apiRouter.admin` if missing.
- A multi-column field-update procedure (PATCH-style) MUST build its input with `mergePatchInput` from `@kobato/contracts/merge-patch`: required `id` outside the patch shape, `clearable(...)` for nullable columns, `splitMergePatch(input)` in the handler (the hand-rolled spread is banned by `apps/kobato/tests/arch/merge-patch-controllers.test.ts`). Reference: `admin.users.update`. Full-record upserts, single-field setters, lifecycle actions, and the settings section merge are deliberately NOT merge-patch.

### Hono / oRPC rules

- No business logic inside procedure handlers. Throw `ORPCError('CODE', { message })`; services never throw `HTTPException`.
- **Error copy is a typed descriptor, not prose.** A migrated producer throws `DomainError`/`ActionFailure` with an `ErrorMessageDescriptor` (`{ messageKey, params?, fallbackMessage }`) as its `message`; the boundaries translate per request. Every issue carries the resolved `message` ALONGSIDE `messageKey`/`params`/`fallbackMessage`; a key never substitutes for text. `ORPCError.data` is `{ descriptor, issues }` (never a bare issue array). Un-migrated domains pass a raw string through the `error.api.rawMessage` passthrough.
- Client-side validation schemas put a typed `UiMessageId` in `message` (never raw copy); the server maps Zod issues via `server/infra/http/error-descriptor`. An entity noun crosses as a MACHINE kind, rendered by the catalog's ICU `select`.
- Perimeter middlewares throw `LocalizedHttpException`; controllers that throw `ORPCError` directly use `localizedOrpcError(context, code, messageKey, params?)`; resource routes use `failureJsonResponse` / `errorJsonResponse`. A `worker_threads` isolate throws `WorkerDomainError` carrying the same descriptor through structured clone.
- Ordinary `Error` is reserved for CLI-only/technical output; user-visible background failures carry descriptors (the self-update job, save-result warnings, auth flows' `AuthFlowResult`). Settings strict patches reject unknown keys with `unrecognizedKeys`.
- No ad-hoc Hono RPC routes bypassing `apiRouter`; non-JSON routes belong in `resources/`. Procedure inputs are a single flat object.

## render/

SSR output products: `seo/`, `feed/`, `og/`, `calendar/`, `warmup/`, plus `canvas-fonts.ts` and `pretext-layout.ts` at the root. Every other file belongs to a product subdirectory. Never persists — produces strings, Buffers, or Responses; caching is the caller's responsibility, subject to:

- `feed` and `calendar` cache keys include the request locale + `APP_VERSION` + their SCOPE revision; their HTTP resources answer `Cache-Control: public, no-cache` with a byte-derived ETag + `Content-Language`. The feed renders each entry's saved `bodyHtmlFeed` projection through the `sanitizeFeedHtml` allowlist.
- Renderers receive the request context's PINNED `settings` bundle (never a second snapshot read), so rendered bytes belong to the scope revision in the key. The sitemap keys on the `sitemap` scope; manifest and `robots.txt` read the same capture.
- The sidebar's latest-comments digest and taxonomy lists read SQLite directly (indexed point reads, no cache bucket). Section handlers delete render buckets purely to reclaim orphans — correctness comes from the revision key, not the delete.

### Route module prewarming

A Vite plugin (build tooling in `tools/toolchain/src/vite/route-warmup.ts`) splits ~500 client chunks into tiers; `@kobato/distribution` owns the manifest and wire constants; `render/warmup/manifest.ts` emits critical `<link rel="modulepreload">` for the matched route; idle tiers preload via inline script. Tier-2 buckets derive automatically from route-ID prefixes; only `TIER1_ROUTES` is editorial. `apps/kobato/tests/unit/infra/route-warmup.test.ts` pins every route to exactly one bucket.

## Sessions & Request Context

One perimeter middleware derives the canonical `RequestContext` once per request — session, viewer, client address, normalized URL, request facts, db, CSP nonce, plus the PINNED `settings` bundle and the `localization` projection.

- Both getters share ONE lazy capture (`createLazyAppSnapshot`), so a settings save mid-request can never split the rendered bytes from their cache key.
- Both `buildLoadContext` and the `/rpc/*` mount hydrate settings before the capture is first read.
- Every surface projects from it. Same-session mutations call `markSessionDirty()`; the middleware commits `Set-Cookie` after the response — the only commit point.

## Databases

Two embedded engines, zero services:

- **Content DB** — SQLite via `node:sqlite` + drizzle, one file at `storage.database`. Sync driver: `db.transaction(async …)` is a compile error — transactions are sync callbacks. Timestamps `integer({ mode: 'timestamp_ms' })`, booleans `integer({ mode: 'boolean' })`, JSON `text({ mode: 'json' })`; `LIKE`, not `ILIKE`.
- **Analytics sidecar** — DuckDB via `@duckdb/node-api` at `storage.analyticsDatabase`: `access_events` (generic-column Cloudflare-Analytics-Engine style; `index1` entity key, 16 opaque `blobN` columns whose semantics live in the `blobsMap` in `@kobato/db/duckdb/access-events` — `blob5` is the daily-salted visitor hash, raw IPs never persisted; `blob16` reserved) plus the two `device_env_*` sidecars keyed by the request-minted event UUID. Queries are built with Kysely as a compile-only builder and executed through `@kobato/db/duckdb/query::runAnalyticsQuery` — the single `db.duckdb.query` telemetry perimeter (never SQL or parameters). Dashboard SQL lives in `@kobato/db/duckdb/queries/`; metric dimensions own one definition per dimension (`source: 'events'` blob slot or `source: 'env'` bucket expression); every dashboard query excludes geo-unknown events unless `includeUnknown: true`.
- The sidecar is recreated empty when missing but INCLUDED in backups. Storage-format upgrade happens at open (`COPY FROM DATABASE` + atomic rename; failure retries next boot). A legacy `access_log` table is migrated by the boot-time one-shot blob migration.
- **Backup & restore** (`domains/backup/`) — full contract in `src/domains/backup/AGENTS.md`. The 30s global request timeout exempts the restore endpoints (30 min).
- **Page-view counters** — `metric.pv` is written through the in-memory `PageViewBatcher` (flush on 50 bumps or 60s); reads merge the unflushed delta via `pendingViewDelta`. `trackPageView` is synchronous: gates (admin/prefetch/bot), bump, return the minted `analyticsEventId` or `null`. Every public document tracks exactly one view (a 304 never records one); the not-found splat never tracks. `AccessLogBatcher` buffers `{ event, envServer }` and appends both rows in one flush.
- **Env beacon intake** — `POST /api/analytics/env`: 4 KB cap, per-IP rate limit (120/min), schema validation, then the self-registered `DeviceEnvBeaconBatcher`. Event ids are deliberately NOT checked against `access_events` (orphan rows drop at query JOINs); the batcher pre-filters ids already in `device_env_client` — a PK collision would poison the whole appender batch.
- **Daily maintenance** (04:30 site timezone): SQLite `incremental_vacuum` + `optimize` + `job_run` pruning; DuckDB 180-day retention DELETE + `CHECKPOINT`; verification-token purge. `ANALYZE` runs after every bulk load. Both DuckDB mutation windows (retention, backup CHECKPOINT + copy) serialize on one mutation lock.
- **`job_run` history** — opt-in execution history for background jobs; rows left `running` by a crash are swept to `failed` once at boot with the stable `process-restart` machine code; every other stored error renders verbatim.
- **Write batchers** (`infra/db/insert-batcher::FlushLoop`): a flush DRAINS (re-checks until empty); on failure the recovery policy owns the batch and the loop re-arms. `pause()/resume()` quiesce across the backup window; `settle()` joins an in-flight flush WITHOUT draining (closing DuckDB under an in-flight append is a native use-after-free — always await it); past `DEFAULT_MAX_BUFFER_SIZE` (10_000) incoming events are DROPPED, counted, and surfaced with one warn per burst.

## Configuration & Install Gate

- Source of truth: `setting` table — one plain-JSON row per section. The 19 isomorphic Section schemas/defaults live in `@kobato/settings/sections`; the server registry adds server-only write validation. Adding a section = one shared Section module + one registry line.
- In-memory: `BlogSettingsBundle`; SSR reads via `requireBlogSettingsSection('<key>')`; UI uses per-section hooks. New UI MUST NOT read the whole bundle.
- Install flow: `/admin/setup` creates the first admin and seeds sections from registry defaults. `honoInstallGateMiddleware`: no admin → `/admin/setup`; installed → through. "Has admin" == "installed".
- Admin saves: each card POSTs a Section patch; server strict-checks keys, deep-merges, validates against `SECTION_REGISTRY[section].writeSchema ?? .schema`, writes ONLY that row.

## Content

### Posts and pages

- `post` → `/posts/:slug`; `page` → `/:slug`. Both render the revision's saved `bodyHtml` projection; a NULL column falls back to an on-the-fly headless projection (`domains/content/services/body-html.ts::resolveBodyHtml`). `visible=false` posts are excluded from home/random widgets but stay in archives, tags, search, sitemap, feeds.
- **Draft gate**: a post is public-invisible when `status=draft` OR `publishedRevisionId=null` — all public queries MUST check both. The "live" gate is defined once in `domains/content/schemas/live-gate.ts` (`isLive` in-memory, `liveContentWhere` SQL). Never hand-assemble the struct.
- **Body projections**: the save pipeline (`domains/content/lifecycle.ts`) computes `bodyHtml` / `bodyText` / `bodyHtmlFeed` via `infra/lexical/lexical-projection.ts`; the feed downgrade is a state-copy transform in `@kobato/lexical/projection-state.ts`. Projection failure is best-effort (warn + NULL columns). The dashboard「重建文章缓存」button re-derives the three columns corpus-wide, writing only drifted rows.
- **Projection consumers**: feeds render `bodyHtmlFeed`; search stores `bodyText`; webmention link extraction walks the Lexical state directly, never the HTML; comment emails render the saved degraded-HTML snapshot, sanitized at the email boundary.

### Slug derivation

- Canonical: `infra/slug/derive::deriveSlug(text)` — `pinyin-pro` → whitespace-collapse → `github-slugger`. Server-only. The fused resolver is `infra/slug/resolve::resolveSlug`; the route-prefix fence + in-transaction reservation live in `infra/slug/reservation`.
- Page ↔ post slugs share one namespace, enforced by the `slug_registry` table: `reserveSlugInTransaction` checks it in-transaction, and `domains/content/slug-conflict::rethrowSlugConflict` maps raced UNIQUE violations to a clean 409. Heading anchors are stored by the save pipeline in the revision's `headings` column.

### Images

- `image` table; bytes in the active storage backend (`infra/storage/registry::activeBackend` — S3 when configured, local otherwise). Each row persists `storageDriver`, so a local→S3 switch keeps old rows readable. Writes use `activeBackend()`, reads/deletes `backendFor(driver)`, whole-fleet scans `allBackends()` — never import a backend directly. S3 config/lock/migration/asset URLs: `src/domains/storage/AGENTS.md`.
- Test seam: `__setStorageBackendForTests` / `__resetStorageBackendsForTests` substitute a driver→backend mapping. All URL → image-meta resolution flows through `domains/images/services/resolve`.

### Audit Log

- **When**: every state-mutating admin operation and auth lifecycle event; read-only queries MUST NOT. **How**: `recordAuditEventFromContext` after the mutation succeeds. **Naming**: kebab-case present-tense `<entity>_<verb>`.
- **Retention**: DB rows kept `auditLogDbRetentionDays` (default 30), archived daily to S3, then deleted; archives kept `auditLogArchiveRetentionDays` (default 180). **Batcher**: 50 events / 500ms, one multi-row INSERT, flushed on `SIGTERM`/`SIGINT`/`beforeExit`.

### Webmention outbox

- Outbound mentions are DB rows (`webmention_outbox`, UNIQUE(source,target)) processed by a sequential single-worker loop: 5 rows per wake-up, 5 attempts with exponential backoff capped at 12h, batches at least `OUTBOX_MIN_DELAY_MS` (1s) apart. A scheduled post's rows wait for its publish instant; a republish moving the moment LATER raises a pending row's `nextRetryAt` (one-way). `sent` rows are never re-sent.

## Server layering constraints

- `infra/*` imports nothing from `domains/`, `http/`, or `render/`.
- `domains/*` imports nothing from `bootstrap/*` — the composition root wires domain deps through `wire*` seams (`apps/kobato/tests/arch/server-layers.test.ts` bans the direction). Background jobs are the exception: they self-register on `infra/job-registry`.
- `http/controllers/*` and `http/loaders/*` orchestrate only.
- `render/*` produces strings / Buffers / Responses and never persists.
- No barrel `index.ts` files anywhere inside `server/`.
- No `*.server.ts` suffix inside `server/` — it's redundant.
