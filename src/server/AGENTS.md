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

- `db/` — Drizzle pool, schema, migrations, `operations/<entity>.ts` raw helpers; `copy-batcher` + `batcher-registry` for process-level write batchers.
- `cache/` — `registry` behavior plane; `through`/`get`/`set`/`remove`/`clear`/`throughMany` verbs, generation counters, `kv-maintenance` hourly expiry sweep, `inflight` request coalescing.
- `http/` — `etag`, `headers`, `status`, `errors` with `DomainError` / `ActionFailure`.
- `email/`, `search/` (LIKE / pg_trgm / vector drivers), `image/` (worker_threads pool), `crypto/`, `env.ts`, `logger.ts`, `rate-limit.ts`, `slug.ts`.

## domains/

One folder per business domain. Base vocabulary: `schema.ts / repo.ts / service.ts / projection.ts / cache.ts` plus feature-named files. Split by concept cohesion, not line count. Once a subdirectory exists (`services/`, `repos/`), the root file MUST NOT coexist.

- Domains may import `shared/`, `infra/`, other `domains/` — acyclically. When composition would close a cycle, the consumer declares an injected parameter and the caller wires it.
- A domain's `repos/**` (or root `repo.ts`) is **private** — cross-domain consumers import the surface only.
- Three strata: **Core** (`content`, `posts`, `pages`, `pt`, `settings`), **Feature** (`auth`, `users`, `comments`, `taxonomies`, `images`, `assets`, `fonts`, `music`, `friends`, `newsletter`, `webmentions`), **Platform** (`analytics`, `audit`, `backup`, `update`, `storage`). Platform services are leaves — cross-domain imports INTO them compose at the perimeter.

## http/

HTTP perimeter only: `orpc-base.ts` (procedure base), `request-context.ts` (canonical request context — ADR-0003), `api-router.ts`, `errors.ts`, `app.ts` (Hono entry); `middlewares/`; `controllers/` (per-domain, admin under `controllers/admin/`); `resources/` (non-JSON: feed, sitemap, images); `loaders/` (React Router data orchestrators).

Controllers and loaders **orchestrate only** — business logic stays in `domains/<x>/service.ts`.

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

One perimeter middleware derives the canonical `RequestContext` once per request — session, viewer, client address, normalized URL, request facts, db/pool, CSP nonce. Every surface (oRPC bridge, RR `buildLoadContext`, resource routers) projects from it. Same-session mutations call `markSessionDirty()`; the middleware commits `Set-Cookie` after the response. ADR-0003.

## Configuration & Install Gate

- Source of truth: `setting` table — one JSONB row per section, `scope='blog.<section>'`. 18 sections defined in `SECTION_REGISTRY` (`domains/settings/sections/registry.ts`). Adding a section = one new module + one registry line.
- In-memory: `BlogSettingsBundle` (`@/shared/config/types`). SSR reads slices via `requireBlogSettingsSection('<key>')`; UI uses per-section hooks. New UI MUST NOT read the whole bundle.
- Install flow: (1) `/admin/setup` creates first admin; (2) sets `blog.general` + `blog.assets`, seeds remaining 16 sections from registry defaults.
- `honoInstallGateMiddleware`: no admin → `/admin/setup`; installed → through. "Has admin" == "installed".
- Admin saves: each card POSTs a Section patch; server strict-checks keys, deep-merges, validates against `SECTION_REGISTRY[section].schema`, writes ONLY that row.

## Content

### Posts and pages

- `post` → `/posts/:slug`; `page` → `/:slug`. Both rendered via `<PortableTextBody>`.
- `visible=false` posts: hidden from home/random-post widgets but stay in archives, tags, search, sitemap, feeds.
- **Draft gate**: a post is public-invisible when `status=draft` OR `publishedRevisionId=null` — all public queries MUST check both. The full "live" gate is defined once in `domains/content/schemas/live-gate.ts` as `isLive` (in-memory) and `liveContentWhere` (SQL). Never hand-assemble the struct.

### Slug derivation

- Canonical: `@/server/infra/slug::deriveSlug(text)` — pipeline `pinyin-pro` → whitespace-collapse → `github-slugger`. Server-only (`pinyin-pro` must not reach the client).
- Heading anchors: SSR loaders pre-compute via `collectHeadings(body, deriveSlug)`.
- Page ↔ post slugs share one namespace. DB `UNIQUE(slug)` + cross-table fence via `@/server/domains/pages/fence::validateSlugFence`.

### Images

- Postgres `image` table; bytes in the active storage backend (`infra/storage/registry::activeBackend` — S3 when configured, local filesystem otherwise). Each row persists `storageDriver` so a local→S3 switch keeps old rows readable.
- Writes use `activeBackend()`, reads/deletes `backendFor(driver)`. Whole-fleet scans iterate `allBackends()` — never import a backend directly.
- All URL → image-meta resolution flows through `domains/images/services/resolve`.

### Audit Log

- **When**: every state-mutating admin operation and auth lifecycle event. Read-only queries MUST NOT.
- **How**: `recordAuditEventFromContext` from `@/server/domains/audit/services/record`, called after the mutation succeeds.
- **Naming**: kebab-case present-tense `<entity>_<verb>`. Never inline the context extraction.
- **Retention**: DB rows kept `auditLogDbRetentionDays` (default 30), archived daily to S3, then deleted; S3 archives kept `auditLogArchiveRetentionDays` (default 180).
- **Batcher**: buffered in memory (50 events / 500ms), written via `COPY FROM STDIN`; self-registers with `infra/db/batcher-registry`; flushed on `SIGTERM` / `SIGINT` / `beforeExit`.

## Server layering constraints

- `infra/*` imports nothing from `domains/`, `http/`, or `render/`.
- `http/controllers/*` and `http/loaders/*` orchestrate only.
- `render/*` produces strings / Buffers / Responses and never persists.
- No barrel `index.ts` files anywhere inside `server/`.
- No `*.server.ts` suffix inside `server/` — it's redundant.
