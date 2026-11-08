# Server conventions

`src/server/` is SSR-only: may import `shared/` and other `server/`, never `client/` or `ui/`. Four layers, strict one-way import graph:

```
server/
├── infra/    # Technical primitives — zero business knowledge.
├── domains/  # Self-contained business modules (one folder per domain).
├── http/     # HTTP perimeter (oRPC + Hono).
└── render/   # SSR output products (HTML, RSS/Atom, OG, calendar, SEO).
```

## infra/

Pure primitives; imports nothing from `domains/`, `http/`, or `render/`. Module-level contracts (config file, SEA runtime assets/env) live in `infra/AGENTS.md`.

- `db/` — `database.ts` (node:sqlite `DatabaseSync` open/close + pragma block), `migrate.ts`, drizzle schema, `operations/<entity>.ts` raw helpers; `insert-batcher` + `batcher-registry` for process-level write batchers; `maintenance.ts` daily vacuum/optimize job; `query-diagnostics.ts` 'sqlite.db.query' channel → debug-level statement timings (bound values redacted; vitest no-op).
- `job-registry.ts` — the process-level background jobs (backup, audit archive, scheduled publish, webmention queues, maintenance sweeps, GeoIP) each self-register `(name, nextDelayMs, run)` at import time; the hydration phase arms them all with one `startAllRegisteredJobs()` call after settings load. The registry also owns the shared lazy db-handle getter (`setJobHandleGetter` + `jobDb()`), so adding a timer means editing only its own module — no wire preamble, no server.ts edit. Timer mechanics stay in `scheduler-utils::scheduleJob`; enqueue-path nudges use `nudgeRegisteredJob(name)` (no-op until started). Registrations may carry a catalog `task: { key, recordHistory? }`: `scheduleJob` then tracks live state per task (`getSchedulerTaskState` — suspended / nextRunAt / running) and, with `recordHistory`, persists each fire to `job_run` via the recorder — the instrumentation backing `/admin/tasks`.
- `analytics/` — the DuckDB sidecar wrapper (`duckdb.ts`: open/close/path — zero business knowledge; the table DDLs + appenders live in `domains/analytics/services/access-log` and `device-env`).
- `cache/` — `registry` behavior plane; `through`/`get`/`set`/`remove`/`clear`/`throughMany` verbs, generation counters, `kv-maintenance` hourly expiry sweep, `inflight` request coalescing.
- `http/` — `etag`, `headers`, `status`, `errors` with `DomainError` / `ActionFailure`.
- `email/`, `search/` (LIKE-only dispatcher), `image/` (worker_threads pool), `crypto/`, `config.ts` (+ `config-arg.ts` — side-effect-free `--config` argv parsing shared with `sea-cli.ts`), `i18n.ts` (the server translator: react-intl `createIntl` over the merged UI + server catalogs, cached per immutable locale, degrading to English when the catalogs fail validation), `logger.ts`, `rate-limit.ts`, `slug/`.
- `safe-fetch.ts` — THE outbound-fetch surface for user-influenced URLs (SSRF guard: http(s) only, 80/443 port allowlist with a fixed-endpoint opt-out, per-hop DNS-rebinding-validating dial, host revalidation per redirect, credential headers stripped on cross-origin redirects, byte caps). Raw `fetch(` sites in `src/server/` are pinned to an audited allowlist by the boundaries contract test; log lines must use `redactUrlForLog` (shared/utils/safe-url) so signed query strings never reach a log.

## domains/

One folder per business domain. Base vocabulary: `schema.ts / repo.ts / service.ts / projection.ts / cache.ts` plus feature-named files. Split by concept cohesion, not line count. Once a subdirectory exists (`services/`, `repos/`), the root file MUST NOT coexist.

- Domains may import `shared/`, `infra/`, other `domains/` — acyclically. When composition would close a cycle, the consumer declares an injected parameter and the caller wires it.
- A domain's `repos/**` (or root `repo.ts`) is **private** — cross-domain consumers import the surface only.
- `notifications/` — the message center: `notification` rows fanned out at creation into
  `notification_recipient` (unread = `readAt IS NULL`; later-registered users never see historical
  broadcasts). Kinds: `direct` (admin ↔ user, always replyable), `admin` (system → all admins, never
  replyable), `broadcast` (system → all users; admin → all users INCLUDING a pre-read creator self-row,
  so the author can find and recall what they sent; only the admin-created flavor
  can be replyable, and only NON-ADMIN recipients may answer). A user's reply to a replyable broadcast
  FORKS a new `direct` thread delivered to all current admins — the replier's own recipient row is
  pre-marked read, admins answer inside the fork, and the broadcast root thread only ever contains the
  announcement itself (so feedback stays private to the admin team and replies never fan back out to
  the audience). Thread reads/replies are gated by `isThreadParticipant` (LIMIT-1 probes — never
  materialize a broadcast-sized audience); `listThreadParticipantIds` only serves direct-thread reply
  routing. System producers call
  `notifyAdmins` — Platform domains get it injected at the composition root (see
  the Zeabur mail cleanup wiring in `bootstrap/db-lifecycle.ts`); raw queries live in
  `infra/db/operations/notification.ts`. Recall (ADR-0007) is a soft delete: `recallNotification`
  stamps `notification.recalled_at` only where NULL (idempotent), `recallMessage` refuses `direct`
  messages, and the admin procedure `admin.notifications.recall` audits
  `notification_broadcast_recalled` / `notification_admin_recalled` ONLY on the first call. Every read
  path filters `recalled_at IS NULL` — the inbox list and the unread badge (now an INNER JOIN on
  `notification`) drop the message, `getThread` answers NOT_FOUND in the same shape as a missing
  thread, and `canReplyInThread` refuses new replies on a recalled root. Existing forked direct
  threads are untouched: they stay readable and replyable. Email delivery (ADR-0008) is a
  fire-and-forget side effect attached AFTER `createAndFanOut` in the `direct` and `admin`
  producers only (`notifyAdmins`, `sendDirectMessage`, both `replyToThread` branches) through
  `email.ts::queueNotificationEmail`: it resolves recipient emails
  (`findUserEmailsByIds`), renders the shared `AdminNotificationEmail` family and sends one
  message per recipient sequentially. The gate is `mail.enabled` AND `mail.notificationEmails`
  (default ON); broadcasts never email, producers keep their synchronous
  signatures, and a transport failure only reaches the server log. Retention (ADR-0010): the
  daily maintenance job prunes READ recipient rows and orphan roots once the message is 180 days
  old — unread rows are never pruned, and recall itself deletes nothing.
- Three strata: **Core** (`content`, `posts`, `pages`, `pt`, `settings`), **Feature** (`auth`, `users`, `comments`, `taxonomies`, `images`, `assets`, `fonts`, `music`, `friends`, `newsletter`, `webmentions`, `notifications`), **Platform** (`analytics`, `audit`, `backup`, `update`, `storage`). Platform services are leaves — cross-domain imports INTO them compose at the perimeter.
- Platform domains with dedicated docs: `storage` (S3 lock, migration, asset URLs → `domains/storage/AGENTS.md`) and `backup` (archive, encryption, restore → `domains/backup/AGENTS.md`). `update/` (SEA self-update) MUST close the listen socket before spawning the replacement (`job.ts::scheduleSelfRestart`) — see `scripts/sea/AGENTS.md`.

## http/

HTTP perimeter only: `orpc-base.ts` (procedure base), `request-context.ts` (canonical request context — ADR-0003), `api-router.ts`, `errors.ts`, `app.ts` (Hono entry); `middlewares/`; `controllers/` (per-domain, admin under `controllers/admin/`); `resources/` (non-JSON: feed, sitemap, images); `loaders/` (React Router data orchestrators); `ssr-caller.ts` (in-process oRPC caller for route loaders).

Controllers and loaders **orchestrate only** — business logic stays in `domains/<x>/service.ts`.

### Public content API (`content.*`) and admin domain API

The public site's read-only data contract is the `content.*` procedure group — a Ghost-Content-API-style surface implemented by `controllers/content-*.controller.ts` (`bootstrap`, `home`, `posts.list/bySlug`, `pages.bySlug`, `comments.byKey`, `search`, `categories.list`, `archives`), with input/output schemas in `shared/contracts/content.ts`. The admin SSR surface lives in the existing domain groups (`account.*`, `comments.*`, `analytics.*`, `admin.*`) — the 14 endpoints added for the admin loaders (e.g. `admin.posts.mySummary`, `admin.settings.bootstrap`, `comments.myCounts`) are plain domain leaves with schemas in `shared/contracts/admin.ts`; there is deliberately NO page-level aggregate group (loaders compose domain endpoints themselves).

Public route loaders and the root loader consume `content.*` through `createSsrCaller` (`ssr-caller.ts`), which runs the router **in-process** against a `HandlerContext` projected from the canonical `RequestContext` — no HTTP hop; admin/editor loaders use the same seam (it additionally returns `viewer`/`session` for the route-level `requireRole` gates and `isCurrent` projections, since `request-context` is not whitelisted for routes). `ssr-caller.ts` also owns the `unwrapListing`/`unwrapDetail` helpers that translate the output unions back into thrown Responses for the public loaders.

The shared `loaders/*` helpers are the orchestration layer the content controllers call: `listing`/`search`/`sidebar`/`sidebar-select`/`comments`/`detail` plus the per-endpoint pipelines `page-preview` (pages), `post-detail` (posts — ETag probe, draft fallback, canonical 301) and `home` (the full home listing pipeline — analytics write, settings gates, feature fan-out; `loadHomeData`). The pipelines keep signalling 301/302/304/404 by throwing `Response`s, and `http/content-signals.ts::translateThrownResponse` maps those onto a discriminated signal union (or `ORPCError('NOT_FOUND')`). `content.bootstrap` takes no input — it parses the theme cookie itself via `@/shared/utils/theme-cookie` off `context.requestFacts.cookie`. (The former admin loader helpers `dashboard`/`analytics-overview`/`mentions`/`post-analytics` were retired with the admin migration — their orchestration lives in the route loaders now.)

### Base procedures

| Base         | Guard                                 | Use for                    |
| ------------ | ------------------------------------- | -------------------------- |
| `publicProc` | No auth gate; `csrfGuard`             | Anonymous + CSRF mutations |
| `authedProc` | `requireAuth` + `csrfGuard`           | Any logged-in user         |
| `authorProc` | `requireRole('author')` + `csrfGuard` | Authors and admins         |
| `adminProc`  | `requireRole('admin')` + `csrfGuard`  | Admins only                |

`csrfGuard` runs on EVERY `/rpc/*` request — safe methods included (`app.ts` mounts it on the whole prefix, and the middleware has no method carve-out). The browser client attaches the `x-csrf-token` header to every call; anonymous sessions validate against the stateless `__csrf` double-submit token minted on safe methods.

### Adding an endpoint

1. Schema in `shared/contracts/<domain>.ts` or inline `z.object({...})`.
2. Append the procedure to the matching controller with the right base.
3. If the controller isn't in `api-router.ts` yet, add it under `apiRouter` / `apiRouter.admin`.

### Hono / oRPC rules

- No business logic inside procedure handlers.
- Throw `ORPCError('CODE', { message })`; `onErrorHandler` handles the rest. Services never throw `HTTPException`.
- **Error copy is a typed descriptor, not prose.** A migrated producer throws `DomainError`/`ActionFailure`
  with an `ErrorMessageDescriptor` (`{ messageKey, params?, fallbackMessage }` from
  `@/shared/contracts/api-error`) as its `message`; the domain keeps the English
  `fallbackMessage` for logs, and the Hono/oRPC boundaries translate both the top-level message and
  the issues per request (`context.localization.locale` + `server/infra/i18n`). `ORPCError.message`
  is the localized sentence WITH the localized issue summary folded in, and `ORPCError.data` is
  `{ descriptor, issues }` (never a bare issue array); Hono mirrors `{ error: { code, message, descriptor, issues } }`.
  Un-migrated domains still pass a raw string — it rides the `error.api.rawMessage` passthrough key
  and renders unchanged. Client-side validation schemas put a typed `UiMessageId` in `message`
  (never raw copy) and the server maps Zod issues with
  `server/infra/http/error-descriptor` (`zodIssuesToWire`: id → descriptor + `{min}/{max}`/custom
  `params` + English fallback, producer code, path; standard Zod prose stays an English
  passthrough). Perimeter middlewares (RBAC, rate limit, timeout, CSRF, body limit) have no
  `DomainError` channel: they throw `LocalizedHttpException` (`localized-http-exception.ts`) and the
  same handler translates it; responder-style hooks use `errorJsonResponse`. Controllers that throw
  `ORPCError` directly use `localizedOrpcError(context, code, messageKey)` from `orpc-base` so the
  message and descriptor stay in step. Auth flows return `AuthFlowResult` with a descriptor
  (`authFlowError`/`authFlowSuccess`); `routes/auth` resolves it through `authFlowMessage` (the
  route import whitelist). Settings strict patches reject unknown keys with `unrecognizedKeys`
  (one issue per key, full key list in `params.keys`, field path preserved).
- No ad-hoc Hono RPC routes bypassing `apiRouter`; non-JSON routes belong in `resources/`.
- Procedure inputs are a single flat object — no `{ body, query, params }` buckets.

## render/

SSR output products: `seo/`, `feed/`, `og/`, `calendar/`, `canvas-fonts.ts`, `pretext-layout.ts` (canvas text line-breaking via `@chenglou/pretext` — kinsoku-aware wrapping + measured ellipsis for `og/` and `calendar/`; its `OffscreenCanvas` global is shimmed onto @napi-rs/canvas), `analytics/`, `warmup/`. Never persists — produces strings, Buffers, or Responses. Caching is the caller's responsibility. The feed generator renders each entry's saved `bodyHtmlFeed` projection (`domains/content/services/body-html.ts::resolveBodyHtmlFeed`, NULL → on-the-fly headless projection) through the `sanitizeFeedHtml` allowlist.

### Route module prewarming

A Vite plugin splits ~500 client chunks into tiers so the browser proactively loads high-priority routes. At request time, `render/warmup/manifest.ts` matches the pathname against the route tree and emits critical `<link rel="modulepreload">` for the matched route and its ancestor layouts; idle tiers preload lower-priority chunks via inline `<script>`.

Tier-2 buckets derive automatically from route-ID prefixes (`routes/public|admin|editor|auth/*`) in `infra/route-warmup.ts` — adding or removing routes in `src/routes.ts` needs no warmup edits. Only `TIER1_ROUTES` is editorial. A contract test in `tests/unit/server/infra/route-warmup.test.ts` pins every declared route to exactly one bucket.

## Sessions & Request Context

One perimeter middleware derives the canonical `RequestContext` once per request — session, viewer, client address, normalized URL, request facts, db, CSP nonce, and the lazily-memoized `localization` pair (UI locale + site time zone; both `buildLoadContext` for RR loaders AND the `/rpc/*` bridge hydrate settings before the pair is first read). Every surface (oRPC bridge, RR `buildLoadContext`, resource routers) projects from it. Same-session mutations call `markSessionDirty()`; the middleware commits `Set-Cookie` after the response. ADR-0003.

## Databases

Two embedded engines, zero services:

- **Content DB** — SQLite via `node:sqlite` + drizzle (`sqlite-core`), one file at `storage.database` (default `<storage.data>/kobato.db`). Sync driver: awaited builders typecheck OUTSIDE transactions, but `db.transaction(async …)` is a compile error — transactions are sync callbacks. Timestamps are `integer({ mode: 'timestamp_ms' })` (epoch ms), booleans `integer({ mode: 'boolean' })`, JSON `text({ mode: 'json' })`, binary `blob({ mode: 'buffer' })`; `LIKE`, not `ILIKE`.
- **Analytics sidecar** — DuckDB via `@duckdb/node-api`, one file at `storage.analyticsDatabase` (default `<storage.data>/analytics.duckdb`). Holds `access_events` plus the two ADR-0006 device-environment sidecars (`device_env_server` — UA-CH high-entropy values + full Accept-Language list, one row per event, written by the enrich pipeline in the same batcher flush as the main row; `device_env_client` — the client beacon's screen/viewport/DPR/touch/color-scheme/network/locale/hardware dimensions, one row per beacon; both keyed by the request-minted event UUID and joined at query time; DDL + appenders in `services/device-env`, the complete table list in `services/schema.ts::ANALYTICS_DDL`). `access_events` is a generic-column event table in the Cloudflare-Analytics-Engine style (ported from Slite): `index1` entity key (`post:<id>`/`page:<id>`/`''`), 16 opaque `blobN` columns whose semantics live in the `blobsMap` in `domains/analytics/services/access-log` (pinned by a contract test; `blob5` is the daily-salted visitor hash — raw IPs are never persisted; the 16-slot budget deliberately drops `osVersion`/`browserVersion` in favor of `browserType` — Slite never had version dims — and `blob16` is the reserved slot, always written `''`), `double1/2` lat/lng, plus one named `is_bot` boolean. Queries are built with Kysely as a compile-only SQL builder (`services/analytics-sql.ts`: DummyDriver, identifier whitelist, bound parameters only) and executed on a dedicated MVCC reader connection; the batcher writes through the Appender protocol. Dashboard metrics own one definition per dimension in `services/metric-dimensions.ts`: a blob slot (`source: 'events'`) or a server-owned bucket expression over `device_env_client` (`source: 'env'`, ADR-0006). Env dimensions INNER JOIN the sidecar and drop NULL buckets; blob dimensions never join (beacon-less events must stay visible). An env FILTER is a semi-join built from the same bucket expression, so every dashboard query (views/heatmap/counters/export) honors a clicked env label without joining `device_env_client` itself. Every dashboard query also excludes geo-unknown events (country `blob7 = ''`) by default in `services/query-filter.ts` — the wire query's `includeUnknown: true` opts back in (the admin stats page's 包含未知地区 toggle); writes always keep them. Recreated empty when missing, but INCLUDED in backups (the `.tar.gz` archive alongside the content DB and the env-converged `kobato.config.json`). A boot-time one-shot migration (`services/blob-migration.ts`, flag `system.analytics-blob-migration`) converts the legacy named-column `access_log` table — including sidecars restored from old backups — then drops it; the legacy table is probed BEFORE the flag so an analytics-only restore into an install whose flag row already exists still migrates.
- **Backup & restore** (`domains/backup/`) — gzipped tar of the content DB, the analytics sidecar, and the env-converged `kobato.config.json`, optionally password-encrypted (`.enc`). The full contract — record format, restore ordering, crash recovery, upload flow, storage-path validation, audit events — lives in `domains/backup/AGENTS.md`. The 30s global request timeout exempts the restore endpoints (30 min).
- **Page-view counters** — `metric.pv` is written through the in-memory `PageViewBatcher` (`domains/analytics/services/pv-batcher`: flush on 50 bumps of one key or 60s). Reads merge the unflushed delta via `pendingViewDelta`, so served counts stay exact despite the batched write; `domains/comments/services/likes::queryMetadata` is the single read funnel.
- **Page-view tracking** — `trackPageView` (`domains/analytics/track.ts`) is synchronous: it runs every gate (admin / prefetch / bot), bumps the counter, and returns the request's minted `analyticsEventId` (`RequestFacts`, one per request incl. `.data` — the ADR-0006 beacon join key) or `null` when a gate dropped the visit; only the enrich → append tail is async (`flushTrackedEvents()` is the test seam). Every public document tracks exactly one view: home (`loadHomeData`), tag/category listings (`scopedPostsListing`), search (`searchLoader`, after its redirect guards), archives + categories (their `content.*` procedures), and post/page detail (`loadPublicDetailData`, after the 404/301/304 preview settles); the not-found splat never tracks. Public route loaders publish the same id as loader-data `eid` (`createSsrCaller` → `analyticsEventId`). `AccessLogBatcher` buffers a paired `{ event, envServer }` item and appends `access_events` then `device_env_server` in one flush; legacy flat dead-letter lines replay with a freshly minted id and no sidecar row.
- **Env beacon intake** — `POST /api/analytics/env` (`http/resources/analytics.ts`) is the anonymous `sendBeacon` sink: 4 KB body cap (declared `Content-Length` first, then post-read), the dedicated per-IP bucket `tryDeviceEnvBeaconRateLimit` (120/min, no settings surface), `deviceEnvBeaconSchema` validation, then `pushDeviceEnvBeacon` → the self-registered `DeviceEnvBeaconBatcher` (`domains/analytics/services/env-beacon`, own dead-letter file `ANALYTICS_ENV_DEAD_LETTER_PATH`, `flushDeviceEnvBeacons` test seam). Event ids are deliberately NOT checked against `access_events`: a bot-gated or direct-POST id appends an orphan row that query JOINs drop and the same 180-day retention window clears. The batcher pre-filters ids already in `device_env_client` (and duplicates within one batch) before the append — beacons replay on back/forward navigation, StrictMode's dev double effect, and dead-letter replay, and a PK collision would poison the whole appender batch.
- **Daily maintenance** (04:30 site timezone): SQLite `incremental_vacuum` + `optimize` with page/freelist logging plus `job_run` history pruning (30 days / newest 200 per task, `infra/db/job-run-recorder::pruneJobRuns`); DuckDB 180-day retention DELETE on `access_events` + both device-environment sidecars (one cutoff) + `CHECKPOINT` with row/file-size logging (`bootstrap/analytics-lifecycle.ts`); verification-token purge of rows expired >1 day (`domains/auth/token-purge-scheduler.ts`). Pure `ANALYZE` additionally runs after every bulk load (install seed, backup restore). Both DuckDB mutation windows — this retention job and the backup's CHECKPOINT + file copy (`snapshotAnalyticsTo`) — serialize on one module-level mutation lock, so a backup can never copy a file the retention job is mid-DELETE on.
- **`job_run` history** — opt-in execution history for background jobs (trigger, started/finished, duration, status, error), written by `infra/db/job-run-recorder` (wired in `db-lifecycle::wireDatabase`; unwired = silent no-op, writes never throw). Rows left `running` by a crash are swept to `failed` once at boot (`sweepOrphanedJobRuns`, called by `initDatabase` only — the restore rewiring skips it so in-flight jobs of the live process are never mislabeled).
- **Write batchers** (`infra/db/insert-batcher::FlushLoop` — the insert batchers and `PageViewBatcher` share it): a flush DRAINS. Events buffered while a write was in flight had their triggers swallowed by the singleflight (a threshold-crossing push got back the in-flight promise; a fired interval timer was a no-op), so a settled flush re-checks the payload and keeps writing until empty — nothing else would ever schedule them. On failure the recovery policy (dead-letter / merge-back) owns the failed batch and the drain stops (no hot-loop), then the loop re-arms the interval timer so rows buffered mid-flush — whose triggers the singleflight consumed — still flush. `pause()/resume()` quiesce every trigger across the backup consistency window; the teardown flush (`flushForTeardown` — shutdown hook, restore swap) ignores the pause gate so rows buffered inside the window are written, not stranded for `dispose()` to discard. `InsertBatcher` caps its buffer (`DEFAULT_MAX_BUFFER_SIZE` = 10_000, five 2048-row DuckDB append chunks) so a stalled writer cannot grow the heap unboundedly: past the cap incoming events are DROPPED (never dead-lettered — a backpressured page view is not worth replaying), counted cumulatively, and surfaced with one warn per drop burst.

## Configuration & Install Gate

- Source of truth: `setting` table — one plain-JSON row per section, `scope='blog.<section>'`. 18 sections defined in `SECTION_REGISTRY` (`domains/settings/sections/registry.ts`). Adding a section = one new module + one registry line.
- In-memory: `BlogSettingsBundle` (`@/shared/config/types`). SSR reads slices via `requireBlogSettingsSection('<key>')`; UI uses per-section hooks. New UI MUST NOT read the whole bundle.
- Install flow: (1) `/admin/setup` creates first admin; (2) sets `blog.general` + `blog.assets`, seeds remaining 16 sections from registry defaults.
- `honoInstallGateMiddleware`: no admin → `/admin/setup`; installed → through. "Has admin" == "installed".
- Admin saves: each card POSTs a Section patch; server strict-checks keys, deep-merges, validates against `SECTION_REGISTRY[section].writeSchema ?? .schema` (the write schema is the strict one — hydration and the merge base always use the lenient read schema), writes ONLY that row.

## Content

### Posts and pages

- `post` → `/posts/:slug`; `page` → `/:slug`. Both render the revision's saved `bodyHtml`
  projection; a NULL column falls back to an on-the-fly headless projection from the Lexical
  state (`domains/content/services/body-html.ts::resolveBodyHtml`).
- `visible=false` posts: excluded from home/random-post widgets but stay in archives, tags, search, sitemap, feeds.
- **Draft gate**: a post is public-invisible when `status=draft` OR `publishedRevisionId=null` — all public queries MUST check both. The full "live" gate is defined once in `domains/content/schemas/live-gate.ts` as `isLive` (in-memory) and `liveContentWhere` (SQL). Never hand-assemble the struct.
- **Body projections (R9b, inkling migration)**: the save pipeline (`domains/content/lifecycle.ts`) computes the revision row's `bodyHtml` / `bodyText` / `bodyHtmlFeed` columns via `infra/pt/lexical-projection.ts` (the `@/inkling/headless` surface, jsdom-backed) over the canonical Lexical state; the feed variant's downgrade (math→TeX, code→plain pre, host-card substitution) is a state-copy transform in `shared/lexical/projection-state.ts`. Projection failure is best-effort (warn + NULL columns), and the no-op save short-circuit skips the computation — the repo/lifecycle share `repos/mutate::isEquivalentToPublishedLatest`. The dashboard「重建文章缓存」button (`admin.renders.reprojectBodies` → `domains/content/services/reproject-body-html.ts::reprojectBodyHtmlBatch`) re-derives the three columns corpus-wide in batches — the repair path when a renderer-side change leaves the saved projections stale; only drifted rows are written, never `updatedAt` / `clientRevisionToken`.
- **Projection consumers (R14)**: feeds render the saved `bodyHtmlFeed` (see render/ above); the search index stores the saved `bodyText` plain text (`indexPostFromRevision` re-derives on the fly only when the column is NULL, and refuses legacy pre-Lexical array bodies until the R15 backfill); outbound webmention link extraction walks the Lexical state directly (`domains/webmentions/enqueue.ts::extractExternalLinks`), never the HTML; comment notification emails render the comment's saved degraded-HTML `content` snapshot, sanitized at the email boundary (`domains/comments/services/email.ts::sanitizeCommentEmailHtml`).
- **PT→Lexical backfill (R15)**: legacy PortableText `content`/`comment` rows convert row-by-row through the bespoke direct mapper `domains/pt/services/pt-to-lexical.ts` (every PT construct maps explicitly; unmapped constructs fail the row), gated per row by the zero-loss cross-check `domains/pt/services/pt-lexical-crosscheck.ts` (E1–E4; the E5 HTML round-trip is warnings-only). The executor `domains/content/services/pt-lexical-backfill.ts` (`runPtLexicalBackfill`, dry-run default) re-derives the projection columns, re-runs the R9a music meta snapshot, rebuilds the search index, and writes the `system.pt-lexical-backfill` flag row only on a zero-failure apply; `runPtLexicalBackfillAtBoot` applies it once per database at boot (BOOT_MODE 'apply' since R15b), serialized after the asset-URL backfill. The comment hasher and search reindex are injected collaborators (content must not import comments/posts — DAG).

### Slug derivation

- Canonical: `@/server/infra/slug/derive::deriveSlug(text)` — pipeline `pinyin-pro` → whitespace-collapse → `github-slugger`. Server-only (`pinyin-pro` must not reach the client). The fused explicit-or-derived resolver is `@/server/infra/slug/resolve::resolveSlug`; the route-prefix fence + in-transaction reservation live in `@/server/infra/slug/reservation`.
- Heading anchors: the save pipeline stores them in the revision's `headings` column
  (`shared/lexical/collect`); SSR loaders read that projection.
- Page ↔ post slugs share one namespace. Cross-table uniqueness is enforced by the `slug_registry` table: `@/server/infra/slug/reservation::reserveSlugInTransaction` checks it in-transaction, and `@/server/domains/content/slug-conflict::rethrowSlugConflict` maps raced DB `UNIQUE` violations (`{post,page}.slug`, `slug_registry.slug`) to a clean 409.

### Images

- `image` table; bytes in the active storage backend (`infra/storage/registry::activeBackend` — S3 when configured, local filesystem otherwise). Each row persists `storageDriver` so a local→S3 switch keeps old rows readable.
- Writes use `activeBackend()`, reads/deletes `backendFor(driver)`. Whole-fleet scans iterate `allBackends()` — never import a backend directly.
- Test seam: `__setStorageBackendForTests` / `__resetStorageBackendsForTests` substitute a driver→backend mapping (e.g. `tests/_helpers/memory-storage.ts`) so storage-touching tests run without mocking the registry.
- All URL → image-meta resolution flows through `domains/images/services/resolve`.
- S3 configuration, the storage lock, the migration task, key policy, and site-owned asset URLs: `domains/storage/AGENTS.md`.

### Audit Log

- **When**: every state-mutating admin operation and auth lifecycle event. Read-only queries MUST NOT.
- **How**: `recordAuditEventFromContext` from `@/server/domains/audit/services/record`, called after the mutation succeeds.
- **Naming**: kebab-case present-tense `<entity>_<verb>`. Never inline the context extraction.
- **Retention**: DB rows kept `auditLogDbRetentionDays` (default 30), archived daily to S3, then deleted; S3 archives kept `auditLogArchiveRetentionDays` (default 180).
- **Batcher**: buffered in memory (50 events / 500ms), flushed as one multi-row INSERT in a single sync transaction (`infra/db/insert-batcher`); self-registers with `infra/db/batcher-registry`; flushed on `SIGTERM` / `SIGINT` / `beforeExit`.

### Webmention outbox

- Outbound mentions are DB-persisted rows (`webmention_outbox`, UNIQUE(source,target)) processed by a sequential single-worker loop (`domains/webmentions/outbox`): 5 rows per wake-up, 5 attempts with exponential backoff capped at 12h.
- **Rate semantics**: consecutive batches are at least `OUTBOX_MIN_DELAY_MS` (1s) apart — the scheduler's 'due now' answer is floored (`outbox-scheduler`), so a 50-link burst spaces its sends instead of firing back-to-back.
- **Waterline**: a scheduled post's rows wait for its publish instant; a republish moving the moment LATER raises a pending row's `nextRetryAt` (one-way — sending late is benign, sending before the source answers 200 burns the retry budget). `sent` rows are never re-sent.

## Server layering constraints

- `infra/*` imports nothing from `domains/`, `http/`, or `render/`.
- `domains/*` imports nothing from `bootstrap/*` — the composition root wires domain deps through `wire*` seams (`wireRestoreMachine`, `wireBackupSnapshots`, `wireAccessLogBatcher`, `wireSessionStorageDb`, …); the boundaries contract test bans the direction outright. Background jobs are the exception that doesn't need wiring: they self-register on `infra/job-registry`.
- `http/controllers/*` and `http/loaders/*` orchestrate only.
- `render/*` produces strings / Buffers / Responses and never persists.
- No barrel `index.ts` files anywhere inside `server/`.
- No `*.server.ts` suffix inside `server/` — it's redundant.
