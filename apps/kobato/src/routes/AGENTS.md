# Routes conventions

`apps/kobato/src/routes/` holds route modules — loader / action / meta / component orchestration. Read session/context at the perimeter, call orchestrators (`@kobato/server/http/loaders/*`, domain-surface services), render with `@kobato/web-admin` / `@kobato/web-public`. No DB queries, cache access, or markdown parsing inline — never import `@kobato/db/operations/*`. `routes.ts` is the URL contract; URLs and physical paths stay stable. Non-page requests (API, feeds, sitemap, generated images) are Hono routes in `server.ts`; components take plain props, never `server/*` in JSX.

**Public routes and the root loader are the exception**: both read `content.*` via `createSsrCaller` (`@kobato/server/http/ssr-caller`), never domain services or `server/http/loaders/*`.

## Route trees

Four nested trees, each with its own `routes/<tree>/layout.tsx`:

- `public/` — `home`, `archives`, `categories`, `category/list`, `tag/list`, `search/list`, `post/detail`, `page/detail`, `not-found`.
- `auth/` — split-screen login + install: `signin`, `setup/index`.
- `admin/` — admin SPA: `dashboard`, `comments`, `me/*`, `security/*`, `taxonomy/*`, `library/*`, `pages/index`, `posts/*`, `analytics/*`, `settings/*`.
- `editor/` — standalone editing shell (`post/{new,edit,analytics}`, `page/{new,edit}`) with its own layout.

## File naming

Neither `_index.tsx` nor `($slug).tsx` is used: `routes.ts` is the manifest, files are named by **role** — `<area>/layout.tsx` (chrome, error boundary, revalidation), `<entity>/detail.tsx` (single resource), `<entity>/list.tsx` (paginated listing), `<entity>/index.tsx` (bare-prefix admin page), `<entity>/new.tsx` (+ `edit.tsx` for `:id/edit`), `<area>/<role>.tsx` (flat role). Adding a route: pick the area directory, choose a role filename, add the manifest entry — never introduce a new pattern.

## Patterns

- `loader` for render-time data, `action` for form submissions; `redirect`, `data`, `Response`, and thrown responses for control flow.
- **All SSR data goes through oRPC.** Public loaders and `src/root.tsx` call `content.*` via `createSsrCaller`; loaders stay one-liners: `unwrapListing` / `unwrapListingPayload` / `unwrapDetail` map the output union to the URL contract (`redirect` → thrown 301/302, `not-modified` → thrown 304, `ORPCError('NOT_FOUND')` → `notFound()`). Listing loaders forward `if-none-match` and return `data(payload, { headers: { ETag } })`.
- Detail loaders fire `content.comments.byKey` and `webmention.list` only on the ok branch, un-awaited off `commentKey` so they stream via `<Await>` — never speculatively.
- The root loader calls `content.bootstrap()` with no args; `shouldRevalidate` refreshes it on public ↔ workspace navigation and every form action. Root middleware `[traceRouteMiddleware]` stays in the root module.
- The root loader projects `activeFrontendRum()` as `rum`; withheld responses omit the key entirely (no null placeholder, endpoint, or token). `App` mounts `useRum(loaderData.rum ?? null)` once.
- Admin/editor loaders compose `account.*`, `comments.*`, `analytics.*`, `admin.*` via `createSsrCaller`; they keep `requireRole`, map `ORPCError` codes (`NOT_FOUND` → `notFound()`, `SERVICE_UNAVAILABLE` → the historical 503 texts). Gate-only loaders collapse to `guardOnlyLoader('<role>')`.
- Boundaries whitelists — public+root: `ssr-caller`, `route-cache-headers`, `infra/http/*` (+ `render/warmup/*`, `infra/trace/react-router`, `infra/trace/config`); admin/editor: `ssr-caller`, `request-context`, `domains/auth/rbac`, `infra/http/*`; auth (direct): `domains/auth/*`, `domains/comments/services/public-query`, `domains/settings/install-gate`, `http/loaders/signin`, `request-context`, `infra/rate-limit`.

## Content patterns

- `post` + `content` → `/posts/:slug`; `page` + `content` → `/:slug`; both render the saved `bodyHtml` through `DetailBodyChrome`. Public URLs use `slug`, never internal id.
- `visible=false` posts are hidden from home and random widgets but stay in archives, tags, search, sitemap, feeds.

## Page draft preview

- `routes/public/page/detail.tsx` paints the admin-only badge via `PageDetailBody`'s `draftMarker`: `'draft' | 'unpublished-draft' | 'published-draft' | null`.
- Catalog miss → anonymous 404, admin sees latest draft; catalog hit + `?draft=true` → anonymous ignores, admin sees the newer-draft or published-draft marker. Access rule on the entity descriptor (`canPreviewDraft(viewer, meta)`): pages admin-only, posts author+ AND `authorId`.

## Manifest anchors

- **A. Public layout** — pathless layout wrapping every public URL; owns `<BaseLayout>` and the layout-level `import '@/styles/public.css'` (styled first paint — never lazy-load it from a child route). Route modules never import `cards.css`, web partials, or `ui.css` directly. Admin/login/install routes import `@/styles/admin.css`.
- **B. Splat catch-all** — `route('*', 'routes/public/not-found.tsx')` MUST stay last inside `public/layout.tsx`; single-segment `.php` / `cgi-bin` probes hit `:slug` first and are intercepted in `page/detail.tsx` (wp-decoy helper).
- **C. Resource and API routes** — resource routes sit outside `public/layout.tsx` and return a `Response`; internal API endpoints are Hono oRPC procedures, so the manifest holds page routes only.
- **D. Feed URLs** — six URLs from `feedRouter`, mounted at the root, none in `routes.ts`: `/feed`, `/feed/atom`; `/cats/:slug/feed(+/atom)`; `/tags/:slug/feed(+/atom)`. Handlers pin their taxonomy scope at compile time and cache through the `feed` bucket keyed `cat:<slug>` / `tag:<slug>` / `all`. New scope → new `.get()` pair stating its scope inline.
- **F. Auth split-screen layout** — shared by login and install, independent of the admin SPA shell.
- **G. admin SPA shell** — own chrome, opts out of `BaseLayout` via `handle.layout = 'admin'`.
- **H. Settings sub-layout** — hydrates the full `BlogSettingsBundle` once, exposes `{ bundle, timeZones, masks }` via `useOutletContext()`.
