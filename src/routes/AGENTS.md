# Routes conventions

`src/routes/` holds route modules — loader / action / meta / component orchestration. Read session/context at
the perimeter, call orchestrators (`server/http/loaders/*`, domain-surface services), project DTOs through
`shared/`, render with `ui/`. No DB queries, cache access, or markdown parsing inline — never import
`server/infra/db/operations/*` (boundaries contract test). `routes.ts` is the URL contract, route ids derive from
the file path; URLs and physical paths stay stable. Non-page requests (API, feeds, sitemap, generated images) are
Hono routes in `server.ts`, not resource routes; components take plain props, never `server/*` in JSX.

**Public routes and the root loader are the exception**: both read `content.*` via `createSsrCaller`
(`@/server/http/ssr-caller`), never domain services or `server/http/loaders/*`.

## Route trees

Four nested trees, each with its own `routes/<tree>/layout.tsx`:

- `routes/public/` — public site: `home`, `archives`, `categories`, `category/list`, `tag/list`, `search/list`,
  `post/detail`, `page/detail`, `not-found`.
- `routes/auth/` — split-screen login + install: `signin`, `setup/index` (`/admin/setup`).
- `routes/admin/` — admin SPA: `dashboard`, `comments`, `me/{profile,comments,sessions}`,
  `security/{sessions,audit-log,users/{index,detail}}`, `taxonomy/{categories,tags}`,
  `library/{images,music,branding,fonts}`, `pages/index`, `posts/{index,analytics}`,
  `analytics/{layout,overview,realtime,mentions}`, `settings/{layout,index}`.
- `routes/editor/` — standalone editing shell: `post/{new,edit,analytics}`, `page/{new,edit}`; its own layout
  keeps editor chrome free of admin SPA chrome.

## File naming

Neither `_index.tsx` nor `($slug).tsx` is used: `routes.ts` is the manifest, files are named by **role**.

| Role file             | Meaning                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `<area>/layout.tsx`   | Pathless or pathed layout — chrome, error boundary, revalidation policy for its children. |
| `<entity>/detail.tsx` | Single resource (`public/post/detail.tsx`, `admin/security/users/detail.tsx`).            |
| `<entity>/list.tsx`   | Paginated listing, mounted twice (`/cats/:slug` AND `/cats/:slug/page/:num`).             |
| `<entity>/index.tsx`  | The bare-prefix admin page.                                                               |
| `<entity>/new.tsx`    | Admin create form (`/admin/<entity>/new`); `edit.tsx` serves `<entity>/:id/edit`.         |
| `<area>/<role>.tsx`   | Flat role in an area — `public/home.tsx`, `public/not-found.tsx`, `auth/signin.tsx`.      |

Adding a route: pick the area directory, choose a role filename, add the manifest entry in `@/routes`; never
introduce a new pattern.

## Patterns

- `loader` for render-time data, `action` for form submissions; `redirect`, `data`, `Response`, and thrown
  responses for control flow.
- **Public SSR data goes through oRPC.** `routes/public/**` loaders and `src/root.tsx` call `content.*` via
  `createSsrCaller`. Loaders stay one-liners: `unwrapListing` (home/tag/category/search), `unwrapListingPayload`
  (archives/categories), `unwrapDetail` (post/page detail) map the output union to the URL contract — `redirect` →
  thrown 301/302, `not-modified` → thrown 304, `ORPCError('NOT_FOUND')` → `notFound()`. Listing loaders forward
  `if-none-match` and return `data(payload, { headers: { ETag } })`; the 304 is rebuilt from the request
  localization with the listing `private, no-cache` profile.
- Detail loaders fire `content.comments.byKey` and `webmention.list` only on the ok branch, un-awaited off
  `commentKey` so they stream via `<Await>`; never speculatively, so a 304/301/404 read does no comments work.
- The root loader calls `content.bootstrap()` with no args (theme cookie and message scope resolved inside the
  procedure: public pathname vs `/admin` + `/editor`); `shouldRevalidate` refreshes it on public ↔ workspace
  navigation and every form action. Root middleware `[traceRouteMiddleware]` adds one no-op-in-production
  document/`.data` span around loaders, actions, and the SSR entry, and must stay in the root module, not per-route.
- The root loader projects `activeFrontendRum()` as `rum` in every build once all frontend gates pass and the
  runtime verified the O2 allowlist pipeline + stored function hash/wiring; withheld responses omit the key
  entirely — no null placeholder, `serverAuthorizationHeader`, OpenObserve endpoint/organization, or RUM client
  token (the browser posts to the same-origin `/api/rum/intake` relay). `App` mounts
  `useRum(loaderData.rum ?? null)` once; it runs the DNT/GPC check before the dynamic SDK import.
- **Admin SSR data goes through oRPC too.** `routes/admin/**` and `routes/editor/**` loaders compose
  `account.*`, `comments.*`, `analytics.*`, `admin.*` (`shared/contracts/admin.ts`) via the same
  `createSsrCaller`, which also returns `viewer`/`session` for `requireRole` gates and `isCurrent`.
- Admin loaders keep `requireRole`, compose with their own `Promise.all` (role-conditional branches) and map
  `ORPCError` codes (`NOT_FOUND` → `notFound()`, `SERVICE_UNAVAILABLE` → the historical 503 texts); no
  page-level aggregate group exists. Gate-only loaders (`getRequestContext` → `requireRole` → `return null`)
  collapse to `guardOnlyLoader('<role>')` from `@/server/http/request-context`; data loaders keep
  `requireRole(viewer ?? undefined, '<role>')`.
- Boundaries whitelists — public+root: `ssr-caller`, `loaders/route-exports`, `infra/http/*` (+ `render/warmup/*`,
  `infra/trace/react-router`, `infra/trace/config`); admin/editor: `ssr-caller`, `request-context`,
  `domains/auth/rbac`, `infra/http/*`; auth (direct): `domains/auth/*`, `domains/comments/services/public-query`,
  `domains/settings/install-gate`, `http/loaders/signin`, `request-context`, `infra/rate-limit`.

## Content patterns

- `post` + `content` → `/posts/:slug`; `page` + `content` → `/:slug`. Both render the saved `bodyHtml` projection
  through `DetailBodyChrome` (see `src/ui/AGENTS.md` → Content editors); public URLs use `slug`, not internal id.
- `visible=false` posts are hidden from the public home and random-post widgets but stay in archives, tags,
  search, sitemap, feeds, and category/tag listings (`src/server/AGENTS.md` → Content).

## Page draft preview

- `routes/public/page/detail.tsx` paints a red admin-only badge via `PageDetailBody`'s `draftMarker`:
  `'draft' | 'unpublished-draft' | 'published-draft' | null`.
- Catalog miss → anonymous 404, admin sees latest draft (**【草稿】**); catalog hit + `?draft=true` → anonymous
  ignores, admin sees **【未发布的草稿】** (newer draft) or **【已发布的草稿】** (latest revision IS published).
- `loadDraftPreviewBySlug(db, pageLifecycleAdapter, slug, viewer)` (`@/server/domains/content/lifecycle`) →
  `{ preview, hasNewerDraft }`; the access rule is on the entity descriptor (`canPreviewDraft(viewer, meta)`):
  pages admin-only, posts author+ AND the post's `authorId` (admins preview anyone's), in the post route.

## Manifest anchors

- **A. Public layout (`routes/public/layout.tsx`)** — **pathless** layout wrapping every public URL; owns
  `<BaseLayout>`, which **statically imports `public.css`** so the matched route graph links the stylesheet (styled
  first paint). **Do not** lazy-load `public.css` from a child route or move it into a regular component — FOUC.
  Admin / login / install / API routes stay outside and import `admin.css` (`src/styles/AGENTS.md` → Entry structure).
- **B. Splat catch-all** — `route('*', 'routes/public/not-found.tsx')` MUST stay last inside `public/layout.tsx`:
  `*` is the lowest-priority match, firing only for paths nothing else handles — multi-segment WordPress probes
  (`/wp-content/plugins/x.php`, `/cgi-bin/test`); single-segment `.php` / `cgi-bin` probes hit `:slug` first and
  are intercepted in `routes/public/page/detail.tsx` (wp-decoy helper).
- **C. Resource and API routes** — resource routes sit outside `public/layout.tsx` (no `<Outlet />`,
  `<BaseLayout>`, or `public.css`) and return a `Response` from a `loader` (GET) or `action` (POST/PATCH/DELETE);
  internal API endpoints are Hono oRPC procedures in `src/server/http/`, so the manifest holds page routes only.
- **D. Feed URLs** — six URLs from `feedRouter` (`src/server/http/resources/feed.ts`), mounted at the root in
  `src/server/http/middleware-pipeline.ts` (`app.route('/', feedRouter)`); none appear in `routes.ts`: `/feed`,
  `/feed/atom` (site-wide); `/cats/:slug/feed`, `/cats/:slug/feed/atom` (`{ category: slug }`); `/tags/:slug/feed`,
  `/tags/:slug/feed/atom` (`{ tag: slug }`). Handlers pin their taxonomy scope at compile time, pass `slug` into
  `generateFeeds`, are rate-limited (`tryResourceRateLimit`), and cache through the cache module's `through` verb
  (`feed` declaration) keyed `cat:<slug>` / `tag:<slug>` / `all`, so a category slugged `all` can't collide. New
  scope → new `.get()` pair stating its scope inline.
- **F. Auth split-screen layout (`routes/auth/layout.tsx`)** — shared by login and the install flow, independent of
  the admin SPA shell.
- **G. admin SPA shell (`routes/admin/layout.tsx`)** — own chrome (sidebar + topbar), opts out of `BaseLayout` via
  `handle.layout = 'admin'`, does not reuse the auth layout (F).
- **H. Settings sub-layout (`routes/admin/settings/layout.tsx`)** — wraps `/admin/settings`, hydrates the full
  `BlogSettingsBundle` once, exposes `{ bundle, timeZones, masks }` (with the admin parent context) via
  `useOutletContext()`, and asserts the bundle invariant up front.
