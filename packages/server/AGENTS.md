# Server conventions

`packages/server/src/` (`@kobato/server`) is SSR-only: it imports `@kobato/db`, `@kobato/api`, the shared leaves, and `@kobato/inkling` only through `/headless` — never `@kobato/web-*` or `@kobato/ui`. Six source roots, strict one-way graph:

```
server/
├── assets/     # Static asset blobs + manifest (data, outside the layer graph).
├── bootstrap/  # Composition root: engine lifecycles and wire* seams.
├── infra/      # Technical primitives — zero business knowledge.
├── domains/    # Self-contained business modules (one folder per domain).
├── http/       # HTTP perimeter (oRPC + Hono).
└── render/     # SSR output products (HTML, RSS/Atom, OG, calendar, SEO).
```

`bootstrap/` is the only root allowed to know every layer; no other module imports it (`apps/kobato/tests/arch/server-layers.test.ts`). `assets/` is static data outside the import graph. A file belongs to exactly one root.

Naming: `kebab-case.ts`/`.tsx`; entity domains plural, mass nouns singular; `*.controller.ts` is reserved for router-owning controllers; every `http/loaders/*.ts` exports a loader.

## infra/

Pure primitives; imports nothing from `domains/`, `http/`, or `render/`. Config and SEA runtime contracts: `src/infra/AGENTS.md`.

- `db/` — persistence adapters only (`paths.ts`, `job-run-recorder.ts`, `insert-batcher` + `batcher-registry`, `maintenance.ts`, `query-diagnostics.ts`). Engines and schemas live in `@kobato/db`; `bootstrap/db-lifecycle.ts` wires them.
- `job-registry.ts` — jobs self-register `(name, nextDelayMs, run)` at import time; `startAllRegisteredJobs()` arms them. Timer mechanics stay in `scheduler-utils::scheduleJob`; a catalog `task: { key, recordHistory? }` adds live state and `job_run` history. `scheduleJob` owns the single `job.run` trace perimeter (name + task key only).
- `cache/` — `file-store` owns the on-disk plane (`<storage.data>/cache/<bucket>/<h[0:2]>/<h[2:]>`, `KBC1` envelope, `_generation` counters); `memory-store` is the process-local L1 (per-bucket LRU; >64 KiB values and the `og`/`calendar` buckets never enter; a hit hands every caller the SAME object — cache results are read-only). `cache/registry` verbs take NO `Database`; `through` writes are fire-and-forget.
- L1 invalidation is synchronous and runs BEFORE the filesystem leg. Process-local is sound: the SEA deployment is a single process. Admin clear of the counter bucket persists `_generation` before dropping shards.
- Settings-derived render entries key on the section-scoped representation generation (`@kobato/settings/representation-scopes`); the boot-unique `AppLocalization.revision` never keys a cache.
- `http/` — `etag`, `headers`, `status`, `errors` (`DomainError`/`ActionFailure`), `email/`, `image/` (worker pool), `crypto/`, `config.ts` + `config-arg.ts`, `i18n.ts`, `logger.ts`, `rate-limit.ts`, `slug/`, `data-paths.ts`, `sea/`. Post search is NOT infra (`domains/posts/services/search-query.ts`).
- `trace/` — `runtime.ts` and `logs-runtime.ts` are the ONLY modules importing `@opentelemetry/*`, reached through one dynamic import in `domains/observability/runtime-manager.ts`; a disabled/unverified config never constructs a provider (`apps/kobato/tests/arch/trace-sdk-boundary.test.ts`). Labels carry closed operation names/methods/statuses only — never URL, host, query, SQL, parameters, keys, or payload. Local OpenObserve provisioning and `trace:smoke` live in `tools/trace/src/`.
- `email/` copy lives in the SERVER catalog; every template takes an explicit `t: ServerTranslator`. User-authored content (comment bodies, post titles, music metadata) is passed raw and never translated.
- `safe-fetch.ts` — THE outbound-fetch surface for user-influenced URLs (SSRF guard). `trustedOrigin` is the ONE private-network exemption (exact-match, admin-validated). Raw `fetch(` sites are pinned to an audited allowlist; logs use `redactUrlForLog`. `__setDnsLookupForTests` replaces DNS for tests that stub `fetch`; tests asserting the DNS guard mock `node:dns/promises` and must NOT set the seam.

## domains/

One folder per business domain; base vocabulary `schema.ts / repo.ts / service.ts / projection.ts / cache.ts` plus feature files. Once a subdirectory exists (`services/`, `repos/`), the root file MUST NOT coexist.

- Domains import `infra/`, the shared leaves, and other `domains/` — acyclically; cycles resolve through an injected parameter wired by the caller. A domain's `repos/**` is private — cross-domain consumers import the surface (`apps/kobato/tests/arch/server-public-surface.test.ts`).
- Three strata: **Core** (`content`, `posts`, `pages`, `settings`), **Feature** (`auth`, `users`, `comments`, `taxonomies`, `images`, `assets`, `fonts`, `music`, `friends`, `newsletter`, `webmentions`, `notifications`), **Platform** (`analytics`, `audit`, `backup`, `update`, `storage`). Platform services are leaves — imports INTO them compose at the perimeter. Dedicated docs: `fonts`, `storage`, `backup`. `update/` MUST close the listen socket before spawning the replacement (`job.ts::scheduleSelfRestart`).
- `notifications/` — rows fan out at creation into `notification_recipient` (unread = `readAt IS NULL`). Kinds: `direct` (always replyable), `admin` (never replyable), `broadcast` (replyable by NON-ADMIN recipients only). A reply to a replyable broadcast FORKS a new `direct` thread to all current admins; reads/replies gate on `isThreadParticipant` (LIMIT-1 probes — never materialize a broadcast-sized audience).
- Recall is a soft delete: `recallNotification` stamps `recalled_at` only where NULL (idempotent); `recallMessage` refuses `direct`; audits fire only on the first call. Every read path filters `recalled_at IS NULL`.
- Email is fire-and-forget AFTER `createAndFanOut` in the `direct`/`admin` producers, gated by `mail.enabled` AND `mail.notificationEmails`; broadcasts never email. Maintenance prunes READ rows and orphan roots at 180 days — unread rows never. `admin`-kind rows store the English fallback plus a nullable i18n descriptor; persisted keys are append-only; every read resolves through `domains/notifications/message.ts`.
- Outbound webmentions are `webmention_outbox` rows (UNIQUE(source,target)) run by a sequential single-worker loop: 5 rows/wake, 5 attempts with backoff capped at 12h, ≥1s apart. Scheduled posts wait for their publish instant; a later republish only raises `nextRetryAt`; `sent` rows never re-send.

## http/

HTTP perimeter only: `orpc-base.ts`, `request-context.ts`, `hono-env.ts`, `api-router.ts`, `errors.ts`, `app.ts`, `orpc-trace.ts`; `middlewares/`; `controllers/` (admin under `admin/`); `resources/`; `loaders/`; `route-cache-headers.ts`; `request/`; `ssr-caller.ts`. Controllers and loaders **orchestrate only** — logic stays in `domains/<x>/service.ts`.

Error translation is a three-file seam: `errors.ts` (vocabulary), `translate-domain-error.ts` (domain error → `ORPCError`), `localized-http-exception.ts` + `leaked-response.ts`. `controllers/**` mirrors the `apiRouter` groups one-to-one; route-less shared factories are the only exception (`admin/revision-shared.ts`) — new exceptions need a line here.

- `orpc-trace.ts` is the oRPC transport seam (`/rpc/*` + in-process `ssr-caller`); spans carry the stable procedure path; input is never recorded.
- `buildCspHeader` is the single dynamic-CSP owner and NEVER widens `connect-src`. The browser SDK posts RUM to the same-origin relay `POST /api/rum/intake/rum/v1/<org>/rum` (`http/resources/rum-intake.ts`), mounted in EVERY build next to `/api/rum/status` — both install-gate-exempt, trace-excluded: fail-closed sub-path validation, 4 KiB query / 1 MiB body caps, 240/min per-IP rate limit, inbound `o2-api-key` deleted, real RUM token appended, `safeFetch` forwarding, 202 or detail-free 502. The OpenObserve origin appears in no policy, document, or CORS entry.

### Public content API (`content.*`)

- The public read-only contract is the `content.*` group (Ghost-Content-API style), implemented by `controllers/content-*.controller.ts`, schemas in `@kobato/contracts/content.ts`. Admin SSR lives in the domain groups; there is deliberately NO page-level aggregate group — loaders compose domain endpoints.
- Public route loaders and the root loader consume `content.*` through `createSsrCaller` (`ssr-caller.ts`) — in-process, no HTTP hop; it also owns `unwrapListing`/`unwrapDetail`.
- `loaders/*` are the orchestration layer (`listing`, `search`, `sidebar`, `comments`, `detail-critical` + the `page-preview` / `post-detail` / `home` pipelines); pipelines signal 301/302/404 by throwing `Response`s mapped by `http/content-signals.ts`.
- Detail revalidation: `content-detail.controller.ts` assembles the payload, fingerprints it (`postEtag`/`pageEtag`), answers `not-modified` only then; draft previews carry `etag: null`. The streamed comment digest is part of `critical`. Listings fingerprint with `listingEtag` (locale/zone/format + revisions + `APP_VERSION` + calendar day) and record a page view only for a served document.
- The sidebar "random" widgets are DETERMINISTIC per representation (seeded shuffle over scope + calendar day + settings revision) — never a per-request CSPRNG (it would break the ETag).
- `content.bootstrap` takes no input: theme cookie + message scope resolved inside, Inkling labels only for signed-in workspace documents, `observability` dropped from the anonymous projection.

### Base procedures

| Base         | Guard                                 | Use for                    |
| ------------ | ------------------------------------- | -------------------------- |
| `publicProc` | No auth gate; `csrfGuard`             | Anonymous + CSRF mutations |
| `authedProc` | `requireAuth` + `csrfGuard`           | Any logged-in user         |
| `authorProc` | `requireRole('author')` + `csrfGuard` | Authors and admins         |
| `adminProc`  | `requireRole('admin')` + `csrfGuard`  | Admins only                |

`csrfGuard` runs on EVERY `/rpc/*` request — safe methods included; anonymous sessions validate against the stateless `__csrf` double-submit token.

### Contract-first procedures

Domains declare `method`/`path`/`input`/`output` ONCE in `@kobato/api`; controllers implement through the `implement{Public,Authed,Author,Admin}` factories in `orpc-base.ts` (the counterparts of the four bases). Reference: `controllers/likes.controller.ts`. A limiter that must run BEFORE input parsing rides the implementer; the final `impl.router({...})` dedupes the shared leading guard.

### Adding an endpoint

- Schema in `@kobato/contracts/<domain>.ts` (never inline); declare in the domain's `@kobato/api` module; implement with the right `implement*` base; register in `apiRouter` / `apiRouter.admin`.
- A multi-column field-update procedure MUST use `mergePatchInput` from `@kobato/contracts/merge-patch` — `clearable(...)` for nullable columns, `splitMergePatch(input)` in the handler (pinned by `apps/kobato/tests/arch/merge-patch-controllers.test.ts`; reference `admin.users.update`). Full-record upserts, single-field setters, lifecycle actions, and the settings section merge are deliberately NOT merge-patch.

### Hono / oRPC rules

- No business logic inside procedure handlers. Throw `ORPCError('CODE', { message })`; services never throw `HTTPException`.
- Error copy is a typed descriptor, not prose: producers throw `DomainError`/`ActionFailure` with an `ErrorMessageDescriptor` (`{ messageKey, params?, fallbackMessage }`); the boundaries translate per request. `ORPCError.data` is `{ descriptor, issues }` (never a bare issue array). Un-migrated domains use the `error.api.rawMessage` passthrough.
- Client validation schemas carry a typed `UiMessageId` in `message`; the server maps Zod issues via `server/infra/http/error-descriptor`. Entity nouns cross as MACHINE kinds rendered by ICU `select`.
- Perimeter middlewares throw `LocalizedHttpException`; direct controller throws use `localizedOrpcError(...)`; resource routes use `failureJsonResponse` / `errorJsonResponse`. A worker isolate throws `WorkerDomainError` carrying the same descriptor.
- Ordinary `Error` is CLI-only; user-visible background failures carry descriptors. Settings strict patches reject unknown keys with `unrecognizedKeys`.
- No ad-hoc Hono RPC routes bypassing `apiRouter`; non-JSON routes belong in `resources/`. Procedure inputs are a single flat object.

## render/

SSR output products: `seo/`, `feed/`, `og/`, `calendar/`, `warmup/`, plus `canvas-fonts.ts` and `pretext-layout.ts` at the root. Produces strings, `Buffer`s, or `Response`s; never persists.

- `feed`/`calendar` cache keys include locale + `APP_VERSION` + their SCOPE revision; their resources answer `public, no-cache` + byte-derived ETag + `Content-Language`. Feeds render the saved `bodyHtmlFeed` through `sanitizeFeedHtml`.
- Renderers receive the request context's PINNED `settings` bundle — never a second snapshot read.
- The sidebar's latest-comments digest and taxonomy lists read SQLite directly (indexed point reads, no bucket).

### Route module prewarming

`tools/toolchain/src/vite/route-warmup.ts` tiers ~500 client chunks; `render/warmup/manifest.ts` emits critical preloads, idle tiers via inline script. Tier-2 buckets derive from route-ID prefixes; only `TIER1_ROUTES` is editorial (`apps/kobato/tests/unit/infra/route-warmup.test.ts` pins one bucket per route).

## Sessions & request context

One perimeter middleware derives the canonical `RequestContext` (session, viewer, address, normalized URL, db, CSP nonce, pinned settings + localization). Both getters share ONE lazy capture (`createLazyAppSnapshot`); `buildLoadContext` and the `/rpc/*` mount hydrate settings before first read. Same-session mutations call `markSessionDirty()`; the middleware commits `Set-Cookie` after the response — the only commit point.

## Databases

Two embedded engines, zero services:

- **Content DB** — SQLite via `node:sqlite` + drizzle at `storage.database`. Transactions are sync callbacks (`db.transaction(async …)` is a compile error). Column modes `timestamp_ms` / `boolean` / `json`; `LIKE`, not `ILIKE`.
- **Analytics sidecar** — DuckDB via `@duckdb/node-api` at `storage.analyticsDatabase`: `access_events` (generic-column style; blob semantics live in the `blobsMap` in `@kobato/db/duckdb/access-events` — `blob5` is the daily-salted visitor hash, raw IPs never persisted) plus the `device_env_*` sidecars keyed by the event UUID. Queries build with Kysely (compile-only) and execute through `@kobato/db/duckdb/query::runAnalyticsQuery` — the single telemetry perimeter. Dashboard SQL lives in `@kobato/db/duckdb/queries/`; one definition per dimension; geo-unknown excluded unless `includeUnknown: true`.
- The sidecar recreates empty when missing but is INCLUDED in backups. Storage-format upgrade happens at open; a legacy `access_log` table is migrated at boot.
- **Backup & restore** — `src/domains/backup/AGENTS.md`. The 30s global request timeout exempts the restore endpoints (30 min).
- **Page views** — `metric.pv` through the in-memory `PageViewBatcher` (flush on 50 bumps / 60s); reads merge `pendingViewDelta`. `trackPageView` is synchronous; every public document tracks exactly one view, a 304 never. `AccessLogBatcher` appends `{ event, envServer }` in one flush.
- **Env beacon intake** — `POST /api/analytics/env`: 4 KB cap, 120/min per-IP, schema validation, then `DeviceEnvBeaconBatcher`. Event ids are NOT checked against `access_events` (orphans drop at JOINs); the batcher pre-filters ids already in `device_env_client`.
- **Daily maintenance** (04:30 site TZ): SQLite `incremental_vacuum` + `optimize` + `job_run` pruning; DuckDB 180-day retention + `CHECKPOINT`; token purge. `ANALYZE` after every bulk load; both DuckDB mutation windows serialize on one lock.
- **`job_run` history** — crash-orphaned `running` rows sweep to `failed` once at boot (`process-restart`); other stored errors render verbatim.
- **Write batchers** (`infra/db/insert-batcher::FlushLoop`): a flush DRAINS; on failure the recovery policy owns the batch. `pause()/resume()` quiesce across the backup window; `settle()` joins an in-flight flush WITHOUT draining — always await it before closing DuckDB. Past 10_000 buffered events, incoming events are DROPPED and counted.

## Configuration & install gate

- Source of truth: the `setting` table — one JSON row per section; the 19 Section schemas/defaults live in `@kobato/settings/sections`, the server registry adds write validation. Adding a section = one shared Section module + one registry line.
- SSR reads via `requireBlogSettingsSection('<key>')`; UI uses per-section hooks. New UI MUST NOT read the whole bundle.
- Install: `/admin/setup` creates the first admin and seeds defaults; `honoInstallGateMiddleware` gates on "has admin" == "installed".
- Admin saves: per-card Section patch; server strict-checks keys, deep-merges, validates against the registry schema, writes only that row.

## Content

### Posts and pages

- `post` → `/posts/:slug`; `page` → `/:slug`; both render the saved `bodyHtml` (NULL falls back to on-the-fly headless projection, `domains/content/services/body-html.ts::resolveBodyHtml`). `visible=false` posts stay in archives, tags, search, sitemap, feeds — only home/random widgets exclude them.
- **Draft gate**: public-invisible when `status=draft` OR `publishedRevisionId=null`; all public queries check both via `domains/content/schemas/live-gate.ts` (`isLive` / `liveContentWhere`) — never hand-assemble.
- **Body projections**: the save pipeline (`domains/content/lifecycle.ts`) computes `bodyHtml` / `bodyText` / `bodyHtmlFeed` via `infra/lexical/`; failure is best-effort (warn + NULL). The dashboard rebuild button re-derives drifted rows only.
- **Consumers**: feeds render `bodyHtmlFeed`; search stores `bodyText`; webmention extraction walks the Lexical state; comment emails render the saved snapshot.

### Slug derivation

- Canonical: `infra/slug/derive::deriveSlug` (pinyin-pro → collapse → github-slugger); resolver `resolve::resolveSlug`; fence + in-transaction reservation in `infra/slug/reservation`. Page ↔ post slugs share the `slug_registry` namespace; `rethrowSlugConflict` maps raced UNIQUE violations to 409.

### Images

- Bytes in the active storage backend (`infra/storage/registry::activeBackend`); each row persists `storageDriver`. Writes use `activeBackend()`, reads/deletes `backendFor(driver)`, fleet scans `allBackends()` — never import a backend directly. S3 details: `src/domains/storage/AGENTS.md`. Test seam: `__setStorageBackendForTests` / `__resetStorageBackendsForTests`. URL→meta resolution flows through `domains/images/services/resolve`.

### Audit log

- Every state-mutating admin operation and auth lifecycle event (read-only never), via `recordAuditEventFromContext` after the mutation succeeds. Naming: kebab-case present-tense `<entity>_<verb>`. Retention: DB rows 30d, S3 archives 180d. Batcher 50 events / 500ms, flushed on SIGTERM/SIGINT/beforeExit.

## Layering constraints

- `infra/*` imports nothing from `domains/`, `http/`, or `render/`.
- `domains/*` imports nothing from `bootstrap/*` — wiring goes through `wire*` seams. Background jobs are the exception (self-register on `infra/job-registry`).
- `http/controllers/*` and `http/loaders/*` orchestrate only; `render/*` never persists.
- No barrel `index.ts` files; no `*.server.ts` suffix.
