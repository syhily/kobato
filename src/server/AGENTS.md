# Server conventions

`src/server/` is SSR-only. May import from `shared/` and other `server/`.
Must not import from `client/` or `ui/`.

Internal four-layer tree with a strict one-way import graph
(`infra → domains → http`, `domains → render → http`):

```
server/
├── infra/      # Technical primitives — zero business knowledge.
├── domains/    # Self-contained business modules (one folder per domain).
├── http/       # HTTP perimeter (oRPC + Hono).
└── render/     # SSR output products (HTML, RSS/Atom, OG, calendar, avatar, SEO).
```

## infra/

Pure primitives. `db/` (Drizzle pool, schema, migrations,
`operations/<entity>.ts` raw helpers), `redis/` (ioredis:
storage, buckets, inflight, `buffer-cache`, `admin-ops`), `http/`
(generic `etag`, `headers`, `status`, `errors` with `DomainError` /
`ActionFailure`), `email/` (sender + React Email), `search/` (LIKE,
pg_trgm and vector drivers, openai client), `env.ts`, `logger.ts`,
`rate-limit.ts`, `slug.ts`.

Imports nothing from `domains/`, `http/`, or `render/`.

## domains/

One folder per business domain. Base vocabulary:
`schema.ts / repo.ts / service.ts / projection.ts / cache.ts` plus
feature-named files (`preview.ts`, `loader.ts`, etc.).

When any domain file (`service.ts`, `repo.ts`, `schema.ts`, etc.)
grows beyond ~300 lines, split it into a focused subdirectory with
per-use-case modules (e.g. `services/catalog.ts`, `repos/admin-query.ts`,
`schemas/general.ts`). Shared helpers and types stay in the root file
or move to a `shared.ts` within the subdirectory. Callers import from
the specific module rather than the monolithic file.

**Consistency rule**: once a subdirectory exists for a base vocabulary
file (e.g. `services/` or `repos/`), the corresponding root file
(`service.ts` or `repo.ts`) MUST NOT coexist in the same domain.
Move every export from the root file into the subdirectory so callers
always import from one predictable location.

Domains: `analytics`, `auth` (session-storage, csrf, rbac, flows,
verification-tokens), `comments` (loader, moderation, projection, likes,
token, badge, url, canonicalize), `content` (revision `repos/` +
entity-agnostic draft→publish `lifecycle.ts` + restore-time
`slug-reclaim.ts`; post/page behavior
attaches via `services/lifecycle-adapter.ts` in each entity domain),
`friends`, `images` (schema, service,
storage, key, process), `music`, `pages`, `posts`, `pt`
(Shiki/KaTeX prerender, canonicalize, comment-to-html),
`settings` (install-flow, install-gate),
`taxonomies/{categories,tags}`, `users`. Plus `audit`. Plus
`webmentions` (W3C Webmention receive: target resolution, SSRF-guarded
source fetch, link verification, moderation).

Domains may import from `shared/`, `infra/`, and other `domains/`.
`tests/contract.cookie.test.ts` pins `domains/auth/session-storage.ts`.

## http/

HTTP perimeter only. Procedure base (`orpc-base.ts`), context, composed
router (`api-router.ts`), error hook (`errors.ts`), Hono entry
(`app.ts`); `middlewares/` (session, csrf,
install-gate, rate-limit, trailing-slash, visitor-cookie, wp-decoy,
hono-rbac); `controllers/` (per-domain `<name>.controller.ts`, admin
under `controllers/admin/`); `resources/` (non-JSON: feed, sitemap,
images, redirects, analytics); `loaders/` (React Router data
orchestrators: detail, listing, search, comments, sidebar, pagination,
revalidate, route-exports).

Controllers and loaders **orchestrate only** — business logic stays in
`domains/<x>/service.ts`.

### Base procedures

Built off `os.$context<HandlerContext>()`. Each chains its own auth/role
middleware; the leaf procedure picks one and inherits the guard.

| Base         | Guard                                 | Use for                    |
| ------------ | ------------------------------------- | -------------------------- |
| `publicProc` | No auth gate; `csrfGuard` on non-GET  | Anonymous + CSRF mutations |
| `authedProc` | `requireAuth` + `csrfGuard`           | Any logged-in user         |
| `authorProc` | `requireRole('author')` + `csrfGuard` | Authors and admins         |
| `adminProc`  | `requireRole('admin')` + `csrfGuard`  | Admins only                |

### Controllers

Shape: `procBase.input(zod).output(zod).handler(({input, context}) => …)`,
exported on the file's `<domain>Router`. Handlers orchestrate only;
business logic stays in `server/domains/<x>/service.ts`.

**Adding an endpoint**: (1) shared schema → `shared/contracts/<domain>.ts`
with a parity assertion, OR inline `z.object({...})` next to the
procedure; (2) append a procedure to the matching controller, picking
the right base; (3) controller already wired in `api-router.ts`?
done — else add one line under `apiRouter` or `apiRouter.admin`.

### Router and mount

`server/http/api-router.ts` groups per-domain routers into `apiRouter`
(`ApiRouter`). The `admin: {…}` sub-tree mirrors the URL hierarchy.
Mount: one `RPCHandler` at `/rpc/*` with `csrfGuard` upstream — handlers
never call `validateRequestCsrf` themselves. Per-procedure response
headers ride through a mutable `responseHeaders: Headers` on the context
and are merged onto the final `Response`.

**Resource routers** (`server/http/resources/`) are native Hono for
non-JSON output. RBAC via
`server/http/middlewares/hono-rbac.ts::requireRoleMw`.

**Audit permissions** with one grep:
`grep -rn "adminProc\|authorProc\|authedProc\|publicProc" src/server/http/controllers/`.
Smoke coverage in `tests/server.http.orpc-smoke.test.ts`.

### Hono / oRPC rules

- No business logic inside procedure handlers.
- Throw `ORPCError('CODE', { message })` from procedures or services.
  `onErrorHandler` (`server/http/errors.ts`) handles the rest.
  Service layers do not throw `HTTPException`.
- Do not bypass `apiRouter` with ad-hoc Hono RPC routes. Non-JSON
  resource routes belong in `server/http/resources/`.
- Procedure inputs are a single flat object — no
  `{ body, query, params }` buckets.
- Use `.output(z.void())` for 204-like procedures.

## render/

SSR output products. `seo/`, `feed/` (RSS/Atom + PT-feed renderer),
`og/`, `calendar/` (SVG + Hono serve helper), `avatar/` (Gravatar/QQ
fetcher + Redis cache), `react-prerender.ts`, `image-enhance.ts` (feed
HTML post-processor), `image-compress.ts` (shared PNG helper).

Never persists — produces strings, Buffers, or Responses. Caching is
the caller's responsibility.

## Sessions, Env, Security

- Sessions: Hono middleware (`server/http/middlewares/session.ts`)
  wraps React Router `createSessionStorage` with Redis persistence and
  a signed `__session` cookie. `SESSION_SECRET` required. Populates
  `c.var.session` and commits `Set-Cookie` after the response.
- Server env: `@/server/infra/env` (inline `createEnv` + Zod). Adding
  an env var updates the schema, `src/env.d.ts`, and `.env.example`
  together.
- The S3 toggle (`assets.storage.enabled`), credentials, bucket, asset
  CDN host, and upload limits live under `setting('blog.assets')`,
  edited at `/admin/settings/assets`. No `ASSET_HOST` /
  `ASSET_SCHEME` env vars; `assets.asset.host` / `assets.asset.scheme`
  is the same CDN host used by the image library and `<MusicPlayer>`.
- CSRF: `@/server/domains/auth/csrf`. Client-address parsing:
  `@/shared/utils/request` + `@/shared/utils/security`. Use `zod`
  directly.

### Env vars vs database settings

Env vars live in `@/server/infra/env.ts` and require a redeploy to change.
Database settings live in the `setting` table and are editable at runtime via
`/admin/settings`. Three categories decide where a config belongs:

**Category 1 — Env var (immutable runtime constants)**
Configuration that is set once during deployment and never changed by admins.
Examples: `HOST`, `PORT`, `LOG_LEVEL`, `DB_POOL_MAX`, `DB_STATEMENT_TIMEOUT_MS`.

**Category 2 — Env var (secrets & credentials)**
Passwords, API keys, connection strings, and signing secrets that must not live
in the database (or must be encrypted if they do). Examples: `DATABASE_URL`,
`REDIS_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`.

**Category 3 — Env var (deployment-local filesystem paths)**
Paths that are specific to the Docker/host environment and meaningless to change
at runtime. Example: `DATA_PATH`.

**What belongs in database settings**
Everything else: feature toggles, thresholds, URLs, CDN hosts, pagination sizes,
relative font paths, and any behavior an admin might want to flip without
redeploying. Examples: `assets.storage.enabled`, `seo.og.width`,
`analytics.trackAdmin`, `cache.og.ttlSeconds`.

- Negative rule: if a config could reasonably be toggled by an admin from the
  dashboard, it MUST be a database setting, not an env var.

## Configuration & Install Gate

- Source of truth is the `setting` table — one JSONB row per section,
  `scope='blog.<section>'`. 18 sections: `general`, `assets`,
  `navigation`, `socials`, `content`, `sidebar`, `comments`, `seo`,
  `mail`, `newsletter`, `cache`, `rateLimit`, `search`, `fonts`,
  `backup`, `limits`, `analytics`, `security`.
  Per-section splitting avoids races between concurrent admin tabs.
- Section ↔ DB scope ↔ Zod schema ↔ bundle key mapping lives in
  `@/server/domains/settings/sections/registry.ts`'s `SECTION_REGISTRY`.
- In-memory composition: `BlogSettingsBundle` (`@/shared/config/blog`).
  SSR uses `requireBlogSettingsSection('<key>')`; UI uses the matching
  per-section hook. **New UI MUST NOT** read the aggregated
  `useBlogSettingsBundle()` — reading a slice you don't need re-renders
  on every unrelated section save.
- Install flow is two stages, gated by admin login:
  1. `routes/auth/setup/index.tsx` (`/admin/setup`) creates
     the first admin row and auto-logs in. Redirects to stage 2.
  2. `routes/auth/setup/settings.tsx`
     (`/admin/setup/settings`) persists `blog.general` and
     `blog.assets` from the form AND seeds the remaining 16 sections
     from `SECTION_REGISTRY[<section>].defaults`. All 18 rows are
     written atomically. `blog.assets` defaults to upload toggle OFF.
- `honoInstallGateMiddleware`
  (`@/server/http/middlewares/install-gate.ts`) reads
  `getInstallState()` and routes: no admin → `/admin/setup`;
  installed → through. Static assets, framework internals, and the
  install/login pair are exempt via `ensureInstalledOrRedirect()` /
  `ensureNoAdminOrRedirect()`. After the one-step install migration,
  "has admin" is equivalent to "installed" — there is no intermediate
  state.
- Pre-existing deployments missing optional sections are backfilled
  lazily by `loadSettingsFromDb()` + `upsertSetting`. Best-effort,
  swallows DB errors.
- Admin saves go through `api.admin.settings.update` (oRPC), which
  validates against `SECTION_REGISTRY[section].schema` and writes ONLY
  that one row. No aggregate "reset to defaults" action.

## Content

### Posts and pages

- `post` + `content` → `/posts/:slug`. `page` + `content` → `/:slug`.
  Both rendered via `<PortableTextBody>`. Public URLs use `slug`, not
  internal id.
- Custom block components in `@/ui/pt/blocks/`.
- `visible=false` posts are hidden from the public home and random-post
  widgets but stay in `/archives`, `/tags/:slug`, `/search/:keyword`,
  `sitemap.xml`, feeds, and category/tag listings and counts.
  Future-dated posts stay excluded until publish time.
- **Post default cover image.** Both `toCmsPost` (detail page) and
  `toClientPostFromMeta` (listings) must fall back to
  `/images/open-graph.png` when `meta.cover` is empty. Any new
  projection function that produces a public `cover` field MUST
  replicate this fallback and be covered by a unit test in
  `tests/service.cms-posts-projection.test.ts`.
- **Draft post visibility gate.** A post is considered draft (invisible
  to the public) when `status=draft` OR `publishedRevisionId=null`.
  The admin lifecycle filter treats both cases as draft; all public
  queries MUST check both conditions: listings
  (`buildPublicPostsWhere`), direct links (`findPostBySlug`), and
  public taxonomy counts (`countPostsByTaxonomy` with the `public`
  gate: live + `visible`). Search is
  gated too — `@/server/infra/search/search.ts::searchPosts` takes the
  gate as a caller-supplied `baseWhere` (the HTTP search loader passes
  `livePostWhere(...)`), keeping `infra/` free of business rules.
  A post with `status=published` but no published revision must NOT
  appear on the home page, in listings, feeds, sitemap, or search
  results. The full "live" gate (not deleted, published, has
  a published revision, `publishedAt` not in the future) is defined
  once in `@/server/domains/content/schema.ts` with two projections
  that MUST be changed together: `isLive` (in-memory predicate) and
  `liveContentWhere` (SQL fragment for post/page meta columns). SQL
  call sites bind columns through the repo-side adapters
  `livePostWhere` (`posts/repos/shared.ts`) / `livePageWhere`
  (`pages/repo.ts`) — never hand-assemble the column struct. Admin
  taxonomy counts deliberately include scheduled posts but still
  require a published revision (`countPostsByTaxonomy` with the
  `admin` gate).

### Taxonomies (categories, tags, friends)

- Postgres tables edited from `/admin/{categories,tags,friends}`.
  Deletion is blocked while a post still references the row.

### Slug derivation and uniqueness

- Canonical helper: `@/server/infra/slug::deriveSlug(text)`. Pipeline
  `pinyin-pro` → whitespace-collapse → `github-slugger`, post-pass
  satisfies `DERIVED_SLUG_PATTERN` from `@/shared/slug` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`).
- Server-only — `pinyin-pro` ships ~150KB of CJK lookup tables and must
  NOT reach the client. Admin forms send `slug?: string`; the service
  derives from the entity name/title when blank.
- All authoring surfaces (tag, category, page, heading-anchor) flow
  through `deriveSlug`. Page schema permits `[._-]` in user-supplied
  slugs so legacy URLs like `archives.html` survive; the derived value
  is always plain kebab-case ASCII.
- Heading anchors for DB-backed pages: SSR loaders pre-compute
  `collectHeadings(body, deriveSlug).map(h => h.slug)` and pass it to
  `<PortableTextBody headingSlugs>`. The renderer consumes one slug per
  heading via a per-render cursor; without the prop it falls back to a
  local `github-slugger`.
- **Page ↔ post slugs share one namespace.** Catalog, OG generator,
  comment threading, and sitemap key on slug alone. Enforcement is
  split: DB `UNIQUE(slug)` on `page` catches page↔page; the cross-table
  fence lives in
  `@/server/domains/pages/fence::validateSlugFence`, available for
  cold-start slug fence validation. New slug emitters MUST fold into
  `validateSlugFence`.

### Images

- Postgres `image` table; bytes in the **active storage backend**
  (`@/server/infra/storage/registry::activeBackend` — S3 when configured,
  local filesystem otherwise). Public URL resolves through
  `@/server/infra/storage/public-url::resolveAssetUrl`, dispatching on the
  per-row `storageDriver`: S3 → `<asset.scheme>://<asset.host>/<storagePath>`,
  local → `<siteIdentity.website>/storage/<storagePath>` (served by the
  public `/storage/*` route).
- `@/server/domains/images/storage` is the upload/URL entry point. Writes go
  to the active backend and never 503 on a missing S3 config — local is the
  always-on fallback. Each row persists its `storageDriver` so reads/deletes
  and URL resolution target the right backend after a local→S3 switch.
  Toggling S3 back on does not require re-pasting credentials.
- Every `image` row is a storage object — no `external` origin, no
  `image.source` discriminator.
- Uploads go through `/admin/library/images` (generic
  `images/yyyy/MM/<timestamp>.jpg`), plus inline upload in
  `EditCategoryDialog` (`images/categories/<slug>.jpg`) and
  `EditFriendDialog` (`images/links/<host>.jpg`), both 1280×425.
- `@/server/domains/images/services/enhance` post-processes generated HTML for
  feeds and synchronously resolves cover thumbhashes via a process-level
  LRU cache.

### Music

- Postgres `music` table; audio (`musics/<playerId>.mp3`) and 300×300
  JPEG covers (`musics/<playerId>.jpg`) in the active storage backend,
  written via `@/server/domains/music/storage` (same active-backend model
  as images). The per-track `storageDriver` is persisted so reads/deletes
  and URL resolution dispatch correctly.
- PortableText references rows via a 16-char lowercase random id. Service
  is netease-only via the inline `NeteaseResolver`; `(source, sourceId)` is unique with
  `source` reserved as varchar for future providers. Lyrics live in
  `music.lyric` so the player avoids a second round trip.

### Audit Log

- **When to record**: Every state-mutating admin operation, auth
  lifecycle event (login/logout/password reset), and bulk action MUST
  emit an audit event. Read-only queries (list, get, preview) MUST NOT.
- **How to record**: Import `recordAuditEventFromContext` from
  `@/server/domains/audit/service` and call it after the mutation
  succeeds (so failures are not logged). Never inline the context
  extraction — the helper reads `actorId`, `actorRole`, `ipAddress`,
  and `userAgent` from `HandlerContext` consistently.
- **Action naming**: Use kebab-case verbs in present tense:
  `<entity>_<verb>` (e.g. `post_published`, `user_soft_deleted`).
  Avoid `_by_admin` suffixes; the actor identity already distinguishes
  who performed the action.
- **Resource type**: Use the singular table/entity name (`post`,
  `page`, `user`, `session`, `comment`, `setting`, …). Keep it
  consistent with `RESOURCE_TYPE_OPTIONS` in the admin UI filter.
- **Details**: Put only non-sensitive metadata in `details`. L3
  sensitive fields (`email`, `ip`, `userAgent`, `phone`, `cookie`,
  `deviceId`, `authorEmail`, `authorIp`) are automatically tagged with
  `{E}…{/E}` before storage and masked to `***` in API responses.
  Do NOT put passwords, tokens, or raw session ids in details.
- **Retention**: DB rows are kept for `auditLogDbRetentionDays`
  (default 30, max 90). Older rows are archived daily at 04:00 to S3
  as `audit-log/archive/YYYY-MM-DD.jsonl.gz` and then deleted from
  the DB. S3 archives are kept for `auditLogArchiveRetentionDays`
  (default 180). The `audit_log` table is excluded from `pg_dump`
  backups.
- **Querying**: The admin list API clamps `dateFrom` to the retention
  boundary server-side so the UI cannot request data that has already
  been archived.
- **Batcher**: Events are buffered in memory (threshold 50 events /
  500ms flush) and written via Postgres `COPY FROM STDIN` for
  throughput. On COPY failure the batch falls back to per-row INSERT.
  Events in the buffer at process shutdown are flushed on `SIGTERM` /
  `SIGINT` / `beforeExit`.
- **UI sync checklist**: When adding a new action, add a Chinese
  translation to `ACTION_OPTIONS` in
  `src/ui/admin/audit/filter-constants.ts`. Untranslated actions fall
  back to the raw slug in the admin list and filter, so keep the list
  in sync with every emitted event.

## Server layering constraints

- `infra/*` imports nothing from `domains/`, `http/`, or `render/`.
- `domains/*` modules use the locked
  `schema.ts / repo.ts / service.ts / projection.ts / cache.ts`
  vocabulary. Do not reintroduce `repository.ts` + `query.ts`
  coexistence. Do not split a domain's schema, queries, or cache into
  `infra/` (`infra/db/operations/` is the only exception — raw
  Drizzle helpers shared across domains).
- `http/controllers/*` and `http/loaders/*` orchestrate only.
  Admin procedures live under `controllers/admin/` and mount at
  `apiRouter.admin.<name>`.
- `render/*` produces strings / Buffers / Responses and never
  persists. Caching is the caller's responsibility.
- No barrel `index.ts` files anywhere inside `server/`.
