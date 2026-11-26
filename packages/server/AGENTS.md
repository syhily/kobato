# Server conventions

`packages/server/src/` (`@kobato/server`) knows no frontend framework: it imports NO `react-router` (pinned by the arch
test), and besides `@kobato/db`, `@kobato/api`, the shared leaves, and `@kobato/inkling` through `/headless` it imports
neither `@kobato/web-*` nor `@kobato/ui`. There is no `createSsrCaller` and no React Router mount — every frontend
caller reaches the apiRouter over HTTP (`/rpc/*`), the workspace SPA shell lives in the app
(`apps/kobato/src/server/backend-server.ts`).

```
server/
├── assets/     # Static asset blobs + manifest (data, outside the layer graph).
├── bootstrap/  # Composition root: engine lifecycles and wire* seams.
├── infra/      # Technical primitives — zero business knowledge (src/infra/AGENTS.md).
├── domains/    # Self-contained business modules (one folder per domain).
├── http/       # HTTP perimeter (oRPC + Hono).
└── render/     # Output products (RSS/Atom, OG, calendar, SEO).
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

infra/ conventions (config table, cache planes, job registry, safe-fetch, SEA runtime) live in `src/infra/AGENTS.md`;
domains with dedicated docs: `src/domains/{backup,storage,fonts}/AGENTS.md`.

## domains/

One folder per business domain; base vocabulary `schema.ts / repo.ts / service.ts / projection.ts / cache.ts` plus
feature files. Once a subdirectory exists (`services/`, `repos/`), the root file MUST NOT coexist.

- Strata: **Core** (`content`, `posts`, `pages`, `settings`), **Feature** (`auth`, `users`, `comments`, `taxonomies`,
  `images`, `assets`, `fonts`, `music`, `friends`, `newsletter`, `webmentions`, `notifications`), **Platform**
  (`analytics`, `audit`, `backup`, `update`, `storage`); Platform services are leaves. `update/` MUST close the listen
  socket before spawning the replacement.
- `notifications/`: creation fans out `notification_recipient` rows (unread = `readAt IS NULL`); recall is a soft delete
  (`recalled_at` stamps only where NULL, every read filters it, audits fire only on the first call); `direct` is always
  replyable, `admin` never, `broadcast` only for NON-ADMIN recipients (a reply to a replyable broadcast forks a new
  `direct` thread); reads/replies gate on `isThreadParticipant`; broadcasts never email; every read resolves through
  `domains/notifications/message.ts`.
- Outbound webmentions are `webmention_outbox` rows (UNIQUE(source,target)) driven by a sequential single-worker loop:
  `sent` rows never re-send; a later republish only raises `nextRetryAt`.

## http/

HTTP perimeter only: `orpc-base.ts`, `contract-implementation.ts`, `request-context.ts` (the `RequestContext` interface;
the deriving middleware lives in `middlewares/request-context.ts`), `middleware-pipeline.ts`, `hono-env.ts`,
`api-router.ts`, `errors.ts`, `app.ts`, `orpc-trace.ts`, `content-not-found.ts`, `middlewares/`, `controllers/`
(`public/`, `account/`, `admin/`), `loaders/`, `request/`. There is no `resources/` directory: every former Hono
resource is a `public.*` procedure pair now, and kobato's Hono app serves only `/rpc/*`, `/health`, `/ready`,
`/admin/assets/*`, and the workspace shell. The pipeline keeps the static `secureHeaders` CSP (`overwrite: false` — a
handler-set CSP, i.e. the SPA shell nonce policy, survives), the conditional HSTS header, and the generic static-asset
`cache` middleware; there is no per-request dynamic CSP, `Accept-CH`, or Webmention `Link` — kobato no longer renders
documents.

- Controllers and loaders **orchestrate only** — logic stays in `domains/<x>/service.ts`. `controllers/**` mirrors the
  `apiRouter` groups one-to-one (`apiRouter.public.comments` ⇔ `controllers/public/comments-*.controller.ts`); only the
  route-less shared factories (`admin/revision-shared.ts`, `account/auth-shared.ts`) are excepted. The promoted
  interaction domains of ADR-0009 §2 implement in `controllers/public/` — `likes` / `friends` / `newsletter` on the
  anonymous+CSRF `publicProc` base, `notifications` and the own-comment writes (`comments-own.controller.ts`) on
  `authedProc` — while the "my comments" reads stay in `controllers/account/comments-authed.controller.ts`.
- The ADR-0009 §8 document-like resources are procedure pairs: `controllers/public/feeds.controller.ts` and
  `controllers/public/sitemap.controller.ts` own the six feed URLs and `/sitemap.xml`
  (`rateLimitByIp('feed'/'sitemap', 'resource')` preserved, `infra/cache/registry` `through()` caching and
  `infra/http/etag` fingerprints exactly where they were). The binary families are procedure pairs too:
  `image.controller.ts` owns `images.og` + `images.calendar` (the former `resources/images.ts` adapter table, the
  `through('og'/'calendar')` buckets, and the `rateLimitByIp('images', 'resource')` budget unchanged;
  `@kobato/server/render/warmup/content-cache` still loads beside it), `avatar.controller.ts` owns `avatar.image` (the
  avatar-ip + per-hash keyed budgets — the keyed limit runs in the handler because oRPC middleware cannot see the parsed
  input), `branding.controller.ts` owns `branding.asset` (`resolveSiteAsset`/`ASSET_ROUTES` unchanged). The streaming
  families are `fonts.controller.ts` and `storage.controller.ts`: a 200/206 answer is a bare `ReadableStream` (status +
  header profile set on `context.responseHeaders`, marked with `RESOURCE_STREAM_HEADER` from
  `@kobato/api/client/resource-stream`) while 304/302/416 ride the media envelope; `http/media-resource.ts` holds the
  shared byte-range/conditional answer builder (`parseByteRange`, `mediaFileAnswer` — the exact etag equality of the old
  local file responder, never weak-comparable), and `domains/storage/{redirect,local-object}.ts` own the S3-primary
  redirect (now an envelope or `'unavailable'` signal) and the stat-backed local object lookup. Public-key invariants
  are unchanged and load-bearing: a storage procedure serves only keys under `images/`, `musics/`, `branding/` with no
  dot segments (`isPublicStorageKey` in the storage controller), a font procedure only keys that survive
  `parseAssetUrlPath` with the `EMBEDDED_FONT_ROUTE_PREFIX` route (a `/storage/...` path is BAD_REQUEST there), and a
  branding procedure only the exact `ASSET_ROUTES` paths. robots.txt, manifest.webmanifest, and the `/tags` + `/search`
  301s are sayaka's (settings bundle reads and pure builders). The external-protocol families are procedure pairs too:
  `webmentions.receive` (in `webmention-public.controller.ts` — the `webmention` IP rate limit rides the implementer,
  the domain `webmentionReceiveSchema` validates inside the handler, and `enqueueWebmention` runs exactly where the
  router called it) and `observability.rumIntake` (in `observability.controller.ts` — it keeps the relay gate, track
  validation, query cap, byte-cap backstop, rate limit, token injection, upstream call, and the relay-outcome metrics;
  the compressed/oversized vetoes and the `no-store` header profile live in sayaka's intake handler). kobato serves NO
  Hono resources — its `/api` registry is empty (`apps/kobato/tests/arch/api-resource-surface.test.ts`).
- Two URL surfaces, never conflated. The **route method/path metadata** from `@kobato/api` is a REST-style compatibility
  record of deployed historical URLs — it must never drift and no REST surface is mounted from it. The **`/rpc/*`
  transport URLs** derive from the ROUTER TREE KEYS (`/rpc/{public,account,admin}/...`) and are the ONLY transport:
  every caller — in-repo or headless (`createKobatoPublicClient`) — uses them.
- Sign-in & install (`account.auth.*` / `account.setup.*`) are anonymous ceremonies with their own rate limits: the
  controllers adapt permissive wire inputs to the domain schemas (services own the user-visible error copy), re-validate
  every `redirectTo` with `safeRedirectPath` themselves, and move flow cookies onto `context.responseHeaders` — never
  the wire output. The workspace's signin and setup routes drive them from the BROWSER over `/rpc/*`; CSRF is enforced
  by the perimeter (`csrfGuard`), so a failure surfaces as a FORBIDDEN error carrying the `error.api.csrfFailed`
  descriptor.
- Public content API (`public.content.*`, Ghost-Content-API style): implemented by
  `controllers/public/content-*.controller.ts`; schemas in `@kobato/api/contracts/public/content.ts`. `loaders/*`
  (`listing`, `search`, `sidebar`, `comments`, `detail-critical` + the `page-preview` / `post-detail` / `home`
  pipelines) are the orchestration layer; pipelines RETURN the wire signal union (`ContentRedirectSignal` for 301/302)
  and throw `ORPCError('NOT_FOUND')` via `http/content-not-found.ts` (`contentNotFound()`, the single definition) for a
  missing entity — nothing under `domains/**`, `http/loaders/**`, or `http/controllers/**` imports `react-router` or
  throws a `Response` for control flow (pinned by `apps/kobato/tests/arch/server-layers.test.ts`). Detail/listing ETags
  fingerprint their payloads (`postEtag`/`pageEtag`/`listingEtag`); a served document records exactly one page view, a
  304 never; sidebar "random" widgets are DETERMINISTIC per representation (a per-request CSPRNG would break the ETag).
- `buildCspHeader` — hoisted into `@kobato/settings/csp`, imported by this pipeline and sayaka's perimeter — is the
  single CSP builder and NEVER widens `connect-src`; the OpenObserve origin appears in no policy, document, or CORS
  entry (browser RUM relays through sayaka's same-origin `/api/rum/intake` handler, which calls the
  `observability.rumIntake` procedure). The SPA shell handler in the app applies it with a per-request nonce to the
  prerendered fallback document.

### Base procedures

| Base         | Guard                                 | Use for                    |
| ------------ | ------------------------------------- | -------------------------- |
| `publicProc` | No auth gate; `csrfGuard`             | Anonymous + CSRF mutations |
| `authedProc` | `requireAuth` + `csrfGuard`           | Any logged-in user         |
| `authorProc` | `requireRole('author')` + `csrfGuard` | Authors and admins         |
| `adminProc`  | `requireRole('admin')` + `csrfGuard`  | Admins only                |

`csrfGuard` runs on every `/rpc/*` request, safe methods included (the RPC transport POSTs reads too); anonymous
sessions validate against the stateless `__csrf` double-submit token. Anonymous public reads are exempt only when
`~orpc.meta.publicRead === true` (declared in `@kobato/api`, derived by `request/public-read-rpc-path.ts`); a separate
`csrfExempt` meta preserves exactly six legacy no-CSRF transports (the anonymous device beacon, the backup download, the
two author music media GETs, and the two inbound protocols) with their role guards intact. Both sets are exact
canonical-path, frozen-key tested; eligibility is never inferred from the HTTP method.

### Contract-first procedures

- Domains declare `method`/`path`/`input`/`output` ONCE in `@kobato/api`; controllers implement through the
  `implement{Public,Authed,Author,Admin}` factories in `orpc-base.ts` (reference:
  `controllers/public/likes.controller.ts`). A limiter that must run BEFORE input parsing rides the implementer;
  `impl.router({...})` dedupes the shared leading guard.
- The `contract-implementation.ts` types make an unbranded contract fail closed: `.router()` accepts only a tree
  matching `ContractImplementation<typeof contract>`, and
  `apiRouter = { … } satisfies ContractImplementation<typeof apiContract>` closes the loop. Shared route-less factories
  stay generic over the host base path so the `defineProcedure` brand survives.

### Adding an endpoint

- Schema in `@kobato/api/contracts/<group>/<domain>.ts` (never inline; vocabulary a second audience needs lives in the
  lower audience layer) → declare in `@kobato/api/rpc/<group>/` → implement on the right `implement*` base → register in
  `apiRouter` and in the group composition root in `@kobato/api`.
- `requestTimeoutMs`, `requestBodyLimit`, `installGateExempt`, and `telemetryExcluded` are declared on the procedure and
  derived through `@kobato/api/rpc/metadata` — no parallel Hono/browser path lists.
- A multi-column field-update procedure MUST use `mergePatchInput` from `@kobato/api/contracts/primitives`
  (`clearable(...)` for nullable columns, `splitMergePatch(input)` in the handler) — pinned by
  `apps/kobato/tests/arch/merge-patch-controllers.test.ts`, reference `admin.users.update`.

### Hono / oRPC rules

- No business logic in procedure handlers. Throw `ORPCError('CODE', { message })`; services never throw `HTTPException`.
- Error copy is a typed descriptor, not prose: producers throw `DomainError`/`ActionFailure` with an
  `ErrorMessageDescriptor` and the boundaries translate per request; `ORPCError.data` is `{ descriptor, issues }`, never
  a bare issue array. Client validation schemas carry a typed `UiMessageId` in `message`; entity nouns cross as MACHINE
  kinds rendered by ICU `select`.
- No ad-hoc Hono command/query/upload/download routes bypassing `apiRouter`: first-party JSON, File/Blob, binary
  streams, event iterators, and both inbound external protocols (Webmention receive, RUM intake) are oRPC procedures.
  There is no `resources/` directory; the `/api` resource registry is EMPTY and stays empty
  (`apps/kobato/tests/arch/api-resource-surface.test.ts`) — a new external-protocol surface joins the contract tree.

## render/

SSR output products (`seo/`, `feed/`, `og/`, `calendar/`, `warmup/`, `canvas-fonts.ts`, `pretext-layout.ts`) produce
strings, `Buffer`s, or `Response`s and never persist. `feed`/`calendar` cache keys include locale + `APP_VERSION` +
their scope revision; renderers receive the request context's PINNED `settings` bundle, never a second snapshot read.
Route prewarming: `tools/pack/src/vite/route-warmup.ts` tiers ~500 client chunks; `render/warmup/manifest.ts` emits
critical preloads + idle tiers via inline script.

## Sessions & request context

One perimeter middleware derives the canonical `RequestContext` (session, viewer, address, normalized URL, db, CSP
nonce, pinned settings + localization); both getters share ONE lazy capture, and the `/rpc/*` mount hydrates settings
before first read. Anonymous requests get the stateless `__csrf` double-submit cookie minted on safe methods
(cookie-exempt prefixes are exactly `['/admin/assets/']` so the workspace shell's own assets never mint) and, regardless
of method, on every public-read RPC path (the RPC transport POSTs reads). The former public resource path prefixes
(`/fonts/`, `/images/`, `/favicon*`, `/logo*`, `/apple-touch-icon*`) and the dead `/assets/`, `/build/`, `/__manifest`,
and `/api/` prefixes are gone from the install-gate and cookie-exempt lists — those URLs are sayaka's or procedural now,
and kobato's remaining surface needs only the workspace assets. Same-session mutations call `markSessionDirty()`; the
middleware commits `Set-Cookie` after the response — the only commit point. `HandlerContext` carries the same
`markSessionDirty` plus a per-request `responseHeaders` for out-of-band headers, merged into the response by the
`/rpc/*` mount. The session container and DB-backed storage are Kobato-owned (`domains/auth/session-storage.ts`) over
`infra/http/signed-cookie.ts`; the cookie wire format is byte-compatible with the historical React Router one in both
directions (pinned by the oracle suites in `tests/unit/server/domains/auth/session-storage.test.ts`), and a signed sid
with no live row starts a FRESH session (no stale-id resurrection).

## Databases

Two embedded engines, zero services:

- **Content DB** — SQLite at `storage.database`, owned by `@kobato/db`. Server src NEVER imports `node:sqlite`/Drizzle,
  constructs SQL, or touches a native client: it passes the opaque `Database`/`DatabaseHandle` tokens to semantic
  `@kobato/db/sqlite/operations/*`. Every transaction runs inside a db operation with sync callbacks
  (`db.transaction(async …)` is a compile error).
- **Analytics sidecar** — DuckDB at `storage.analyticsDatabase`, owned by `@kobato/db`. Server src holds only the opaque
  capabilities from `@kobato/db/duckdb/connection` and the `AnalyticsHandle` token; the single telemetry perimeter is
  `domains/analytics/services/analytics-sql.ts::runAnalyticsQuery`.
- Write batchers (`infra/db/insert-batcher::FlushLoop`): a flush DRAINS and on failure the recovery policy owns the
  batch; `settle()` joins an in-flight flush WITHOUT draining — always await it before closing DuckDB; past 10_000
  buffered events, incoming events are DROPPED and counted.
- Backup & restore: `src/domains/backup/AGENTS.md`. Page views, the env beacon, and daily maintenance run through the
  same seams (`PageViewBatcher`, `DeviceEnvBeaconBatcher`, `infra/job-registry`).

## Configuration & install gate

- Source of truth: the `setting` table, one JSON row per section; the 19 Section schemas/defaults live in
  `@kobato/settings/sections`, the server registry adds write validation. Adding a section = one shared Section module +
  one registry line.
- SSR reads via `requireBlogSettingsSection('<key>')`; UI uses per-section hooks and MUST NOT read the whole bundle.
- Install: `/admin/setup` creates the first admin and seeds defaults; `honoInstallGateMiddleware` gates on "has
  admin" == "installed" and exempts `/admin/assets/` (an uninstalled instance must still serve its own setup shell
  assets) alongside `/admin/signin` and `/admin/setup`. A verified setup session is bound to the LIVE token: on
  `verifyToken` the session stores the flag plus a SHA-256 fingerprint of the verified token (`setupTokenVerifiedFor`),
  and `install`/`restore` require flag AND fingerprint of the CURRENT live token — no live token or a re-minted token
  answers `tokenExpired` and clears the stale flag (the browser cannot mint its way past expiry via `status`). Admin
  saves: per-card Section patch; the server strict-checks keys, deep-merges, validates against the registry schema, and
  writes only that row.

## Content

- `post` → `/posts/:slug`; `page` → `/:slug`; both render the saved `bodyHtml` (NULL falls back to on-the-fly headless
  projection). `visible=false` posts stay in archives, tags, search, sitemap, and feeds; only home/random widgets
  exclude them.
- **Draft gate**: public-invisible when `status=draft` OR `publishedRevisionId=null`; every public query checks both via
  `domains/content/schemas/live-gate.ts` (`isLive` / `liveContentWhere`) — never hand-assemble.
- **Body projections**: the save pipeline (`domains/content/lifecycle.ts`) computes `bodyHtml` / `bodyText` /
  `bodyHtmlFeed` via `infra/lexical/`; failure is best-effort (warn + NULL). Feeds render `bodyHtmlFeed`; search stores
  `bodyText`.
- **Slugs**: `infra/slug/derive::deriveSlug`; resolver `resolve::resolveSlug`. Validation stays server-side; fence +
  in-transaction reservation live in `@kobato/db/sqlite/operations/content/entity-meta`; `rethrowSlugConflict` maps
  raced UNIQUE violations to 409.
- **Images**: bytes live in the active storage backend (`infra/storage/registry::activeBackend`) and each row persists
  `storageDriver`. Writes use `activeBackend()`, reads/deletes `backendFor(driver)`, fleet scans `allBackends()` — never
  import a backend directly. Test seam: `__setStorageBackendForTests`.
- **Audit log**: every state-mutating admin operation and auth lifecycle event (read-only never), via
  `recordAuditEventFromContext` after the mutation succeeds. Names are kebab-case present-tense `<entity>_<verb>`.
