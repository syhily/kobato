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

Pure primitives; imports nothing from `domains/`, `http/`, or `render/`.

- `db/` — `database.ts` (node:sqlite `DatabaseSync` open/close + pragma block), `migrate.ts`, drizzle schema, `operations/<entity>.ts` raw helpers; `insert-batcher` + `batcher-registry` for process-level write batchers; `maintenance.ts` daily vacuum/optimize job.
- `analytics/` — the DuckDB sidecar wrapper (`duckdb.ts`: open/close/path — zero business knowledge; the access_log DDL + appender live in `domains/analytics/services/access-log`).
- `cache/` — `registry` behavior plane; `through`/`get`/`set`/`remove`/`clear`/`throughMany` verbs, generation counters, `kv-maintenance` hourly expiry sweep, `inflight` request coalescing.
- `http/` — `etag`, `headers`, `status`, `errors` with `DomainError` / `ActionFailure`.
- `email/`, `search/` (LIKE-only dispatcher), `image/` (worker_threads pool), `crypto/`, `config.ts` (+ `config-arg.ts` — side-effect-free `--config` argv parsing shared with `sea-cli.ts`), `logger.ts`, `rate-limit.ts`, `slug/`.

## domains/

One folder per business domain. Base vocabulary: `schema.ts / repo.ts / service.ts / projection.ts / cache.ts` plus feature-named files. Split by concept cohesion, not line count. Once a subdirectory exists (`services/`, `repos/`), the root file MUST NOT coexist.

- Domains may import `shared/`, `infra/`, other `domains/` — acyclically. When composition would close a cycle, the consumer declares an injected parameter and the caller wires it.
- A domain's `repos/**` (or root `repo.ts`) is **private** — cross-domain consumers import the surface only.
- Three strata: **Core** (`content`, `posts`, `pages`, `pt`, `settings`), **Feature** (`auth`, `users`, `comments`, `taxonomies`, `images`, `assets`, `fonts`, `music`, `friends`, `newsletter`, `webmentions`), **Platform** (`analytics`, `audit`, `backup`, `update`, `storage`). Platform services are leaves — cross-domain imports INTO them compose at the perimeter.

## http/

HTTP perimeter only: `orpc-base.ts` (procedure base), `request-context.ts` (canonical request context — ADR-0003), `api-router.ts`, `errors.ts`, `app.ts` (Hono entry); `middlewares/`; `controllers/` (per-domain, admin under `controllers/admin/`); `resources/` (non-JSON: feed, sitemap, images); `loaders/` (React Router data orchestrators); `ssr-caller.ts` (in-process oRPC caller for route loaders).

Controllers and loaders **orchestrate only** — business logic stays in `domains/<x>/service.ts`.

### Public content API (`content.*`) and admin domain API

The public site's read-only data contract is the `content.*` procedure group — a Ghost-Content-API-style surface implemented by `controllers/content-*.controller.ts` (`bootstrap`, `home`, `posts.list/bySlug`, `pages.bySlug`, `comments.byKey`, `search`, `categories.list`, `archives`), with input/output schemas in `shared/contracts/content.ts`. The admin SSR surface lives in the existing domain groups (`account.*`, `comments.*`, `analytics.*`, `admin.*`) — the 14 endpoints added for the admin loaders (e.g. `admin.posts.mySummary`, `admin.settings.bootstrap`, `comments.myCounts`) are plain domain leaves with schemas in `shared/contracts/admin.ts`; there is deliberately NO page-level aggregate group (loaders compose domain endpoints themselves).

Public route loaders and the root loader consume `content.*` through `createSsrCaller` (`ssr-caller.ts`), which runs the router **in-process** against a `HandlerContext` projected from the canonical `RequestContext` — no HTTP hop; admin/editor loaders use the same seam (it additionally returns `viewer`/`session` for the route-level `requireRole` gates and `isCurrent` projections, since `request-context` is not whitelisted for routes). `ssr-caller.ts` also owns the `unwrapListing`/`unwrapDetail` helpers that translate the output unions back into thrown Responses for the public loaders.

The shared `loaders/*` helpers are the orchestration layer the content controllers call: `listing`/`search`/`sidebar`/`sidebar-select`/`comments`/`detail` plus the per-endpoint pipelines `page-preview` (pages), `post-detail` (posts — ETag probe, draft fallback, canonical 301) and `home` (the full home listing pipeline — analytics write, settings gates, feature fan-out; `loadHomeData`). The pipelines keep signalling 301/302/304/404 by throwing `Response`s, and `content-signals.ts::translateThrownResponse` maps those onto a discriminated signal union (or `ORPCError('NOT_FOUND')`). `content.bootstrap` takes no input — it parses the theme cookie itself via `@/shared/utils/theme-cookie` off `context.requestFacts.cookie`. (The former admin loader helpers `dashboard`/`analytics-overview`/`mentions`/`post-analytics` were retired with the admin migration — their orchestration lives in the route loaders now.)

### Base procedures

| Base         | Guard                                 | Use for                    |
| ------------ | ------------------------------------- | -------------------------- |
| `publicProc` | No auth gate; `csrfGuard` on non-GET  | Anonymous + CSRF mutations |
| `authedProc` | `requireAuth` + `csrfGuard`           | Any logged-in user         |
| `authorProc` | `requireRole('author')` + `csrfGuard` | Authors and admins         |
| `adminProc`  | `requireRole('admin')` + `csrfGuard`  | Admins only                |

### Adding an endpoint

1. Schema in `shared/contracts/<domain>.ts` or inline `z.object({...})`.
2. Append the procedure to the matching controller with the right base.
3. If the controller isn't in `api-router.ts` yet, add it under `apiRouter` / `apiRouter.admin`.

### Hono / oRPC rules

- No business logic inside procedure handlers.
- Throw `ORPCError('CODE', { message })`; `onErrorHandler` handles the rest. Services never throw `HTTPException`.
- No ad-hoc Hono RPC routes bypassing `apiRouter`; non-JSON routes belong in `resources/`.
- Procedure inputs are a single flat object — no `{ body, query, params }` buckets.

## render/

SSR output products: `seo/`, `feed/`, `og/`, `calendar/`, `canvas-fonts.ts`, `pt-html.ts`, `analytics/`, `warmup/`. Never persists — produces strings, Buffers, or Responses. Caching is the caller's responsibility.

## Sessions & Request Context

One perimeter middleware derives the canonical `RequestContext` once per request — session, viewer, client address, normalized URL, request facts, db, CSP nonce. Every surface (oRPC bridge, RR `buildLoadContext`, resource routers) projects from it. Same-session mutations call `markSessionDirty()`; the middleware commits `Set-Cookie` after the response. ADR-0003.

## Databases

Two embedded engines, zero services:

- **Content DB** — SQLite via `node:sqlite` + drizzle (`sqlite-core`), one file at `storage.database` (default `<storage.data>/kobato.db`). Sync driver: awaited builders typecheck OUTSIDE transactions, but `db.transaction(async …)` is a compile error — transactions are sync callbacks. Timestamps are `integer({ mode: 'timestamp_ms' })` (epoch ms), booleans `integer({ mode: 'boolean' })`, JSON `text({ mode: 'json' })`, binary `blob({ mode: 'buffer' })`; `LIKE`, not `ILIKE`.
- **Analytics sidecar** — DuckDB via `@duckdb/node-api`, one file at `storage.analyticsDatabase` (default `<storage.data>/analytics.duckdb`). Holds `access_log` only (append-heavy telemetry + dashboard scans); recreated empty when missing, but INCLUDED in backups (the two-file `.tar.gz` archive alongside the content DB). The batcher writes through the Appender protocol; queries run on a dedicated MVCC reader connection.
- **Page-view counters** — `metric.pv` is written through the in-memory `PageViewBatcher` (`domains/analytics/services/pv-batcher`: flush on 50 bumps of one key or 60s). Reads merge the unflushed delta via `pendingViewDelta`, so served counts stay exact despite the batched write; `domains/comments/services/likes::queryMetadata` is the single read funnel.
- **Daily maintenance** (04:30 site timezone): SQLite `incremental_vacuum` + `optimize` with page/freelist logging (`infra/db/maintenance.ts`); DuckDB 180-day retention DELETE + `CHECKPOINT` with row/file-size logging (`bootstrap/analytics-lifecycle.ts`); verification-token purge of rows expired >1 day (`domains/auth/token-purge-scheduler.ts`). Pure `ANALYZE` additionally runs after every bulk load (install seed, backup restore). Both DuckDB mutation windows — this retention job and the backup's CHECKPOINT + file copy (`snapshotAnalyticsTo`) — serialize on one module-level mutation lock, so a backup can never copy a file the retention job is mid-DELETE on.
- **Write batchers** (`infra/db/insert-batcher::FlushLoop` — the insert batchers and `PageViewBatcher` share it): a flush DRAINS. Events buffered while a write was in flight had their triggers swallowed by the singleflight (a threshold-crossing push got back the in-flight promise; a fired interval timer was a no-op), so a settled flush re-checks the payload and keeps writing until empty — nothing else would ever schedule them. On failure the recovery policy (dead-letter / merge-back) owns the failed batch and the drain stops (no hot-loop), then the loop re-arms the interval timer so rows buffered mid-flush — whose triggers the singleflight consumed — still flush. `pause()/resume()` quiesce every trigger across the backup consistency window; the teardown flush (`flushForTeardown` — shutdown hook, restore swap) ignores the pause gate so rows buffered inside the window are written, not stranded for `dispose()` to discard.

## Configuration & Install Gate

- Source of truth: `setting` table — one plain-JSON row per section, `scope='blog.<section>'`. 17 sections defined in `SECTION_REGISTRY` (`domains/settings/sections/registry.ts`). Adding a section = one new module + one registry line.
- In-memory: `BlogSettingsBundle` (`@/shared/config/types`). SSR reads slices via `requireBlogSettingsSection('<key>')`; UI uses per-section hooks. New UI MUST NOT read the whole bundle.
- Install flow: (1) `/admin/setup` creates first admin; (2) sets `blog.general` + `blog.assets`, seeds remaining 15 sections from registry defaults.
- `honoInstallGateMiddleware`: no admin → `/admin/setup`; installed → through. "Has admin" == "installed".
- Admin saves: each card POSTs a Section patch; server strict-checks keys, deep-merges, validates against `SECTION_REGISTRY[section].schema`, writes ONLY that row.

## Content

### Posts and pages

- `post` → `/posts/:slug`; `page` → `/:slug`. Both rendered via `<PortableTextBody>`.
- `visible=false` posts: excluded from home/random-post widgets but stay in archives, tags, search, sitemap, feeds.
- **Draft gate**: a post is public-invisible when `status=draft` OR `publishedRevisionId=null` — all public queries MUST check both. The full "live" gate is defined once in `domains/content/schemas/live-gate.ts` as `isLive` (in-memory) and `liveContentWhere` (SQL). Never hand-assemble the struct.

### Slug derivation

- Canonical: `@/server/infra/slug/derive::deriveSlug(text)` — pipeline `pinyin-pro` → whitespace-collapse → `github-slugger`. Server-only (`pinyin-pro` must not reach the client). The fused explicit-or-derived resolver is `@/server/infra/slug/resolve::resolveSlug`; the route-prefix fence + in-transaction reservation live in `@/server/infra/slug/reservation`.
- Heading anchors: SSR loaders pre-compute via `collectHeadings(body, deriveSlug)`.
- Page ↔ post slugs share one namespace. Cross-table uniqueness is enforced by the `slug_registry` table: `@/server/infra/slug/reservation::reserveSlugInTransaction` checks it in-transaction, and `@/server/domains/content/slug-conflict::rethrowSlugConflict` maps raced DB `UNIQUE` violations (`{post,page}.slug`, `slug_registry.slug`) to a clean 409.

### Images

- `image` table; bytes in the active storage backend (`infra/storage/registry::activeBackend` — S3 when configured, local filesystem otherwise). Each row persists `storageDriver` so a local→S3 switch keeps old rows readable.
- Writes use `activeBackend()`, reads/deletes `backendFor(driver)`. Whole-fleet scans iterate `allBackends()` — never import a backend directly.
- Test seam: `__setStorageBackendForTests` / `__resetStorageBackendsForTests` substitute a driver→backend mapping (e.g. `tests/_helpers/memory-storage.ts`) so storage-touching tests run without mocking the registry.
- All URL → image-meta resolution flows through `domains/images/services/resolve`.

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
- `domains/*` imports nothing from `bootstrap/*` — the composition root wires domain deps through `wire*` seams (`wireRestoreMachine`, `wireBackupScheduler`, `wireBackupSnapshots`, `wireAccessLogBatcher`, `wireSessionStorageDb`, …); the boundaries contract test bans the direction outright.
- `http/controllers/*` and `http/loaders/*` orchestrate only.
- `render/*` produces strings / Buffers / Responses and never persists.
- No barrel `index.ts` files anywhere inside `server/`.
- No `*.server.ts` suffix inside `server/` — it's redundant.
