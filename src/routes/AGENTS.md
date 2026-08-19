# Routes conventions

`src/routes/` contains route modules — loader / action / meta / component orchestration. Read
session/context at the perimeter, call orchestrators (`server/http/loaders/*`, domain-surface
services), project DTOs through `shared/`, render with `ui/`. **Public routes and the root loader
are the exception**: they read through the `content.*` oRPC group via `createSsrCaller`
(`@/server/http/ssr-caller`), never touching domain services or `server/http/loaders/*` directly.
No DB queries, cache access, or markdown parsing
inline — never import `server/infra/db/operations/*` (pinned by a boundaries contract test).
Resource routes (feeds, sitemap, OG images, JSON APIs) live alongside page modules so the per-URL
contract is obvious from the file system. This file is the long-form companion to the terse route
manifest in `@/routes` — the **why** behind a `layout()`, route ordering, or `id`.

## Route trees

Four nested trees, each with its own `routes/<tree>/layout.tsx`:

- `routes/public/` — public site: `home`, `archives`, `categories`, `category/list`, `tag/list`,
  `search/list`, `post/detail`, `page/detail`, `not-found`.
- `routes/auth/` — split-screen login + install: `signin`, `setup/index` (`/admin/setup`).
- `routes/admin/` — admin SPA: `dashboard`, `comments`, `me/{profile,comments,sessions}`,
  `security/{sessions,audit-log,users/{index,detail}}`, `taxonomy/{categories,tags}`,
  `library/{images,music,branding,friends}`, `pages/index`, `posts/{index,analytics}`,
  `analytics/{layout,overview,realtime,mentions}`, `settings/{layout,index}`.
- `routes/editor/` — standalone immersive editing shell (split from `routes/admin/`):
  `post/{new,edit,analytics}`, `page/{new,edit}`. Own layout keeps editor chrome free of admin
  SPA chrome.

## File naming

We do **not** use React Router's segment-based filename convention (`_index.tsx`, `($slug).tsx`).
The URL is the contract — `routes.ts` is the manifest, the filesystem is storage. Modules are
grouped by area into sub-directories, each file named by its **role**:

| Role file             | Meaning                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `<area>/layout.tsx`   | Pathless or pathed layout — owns chrome, error boundary, revalidation policy for its children. |
| `<entity>/detail.tsx` | Single-resource page (`public/post/detail.tsx`, `admin/security/users/detail.tsx`).            |
| `<entity>/list.tsx`   | Paginated listing — mounted twice in `routes.ts` (`/cats/:slug` AND `/cats/:slug/page/:num`).  |
| `<entity>/index.tsx`  | The bare-prefix admin page.                                                                    |
| `<entity>/new.tsx`    | Admin create form (`/admin/<entity>/new`).                                                     |
| `<entity>/edit.tsx`   | Admin edit form (`/admin/<entity>/:id/edit`).                                                  |
| `<area>/<role>.tsx`   | Flat role within an area — `public/home.tsx`, `public/not-found.tsx`, `auth/signin.tsx`.       |

Adding a route: pick the area directory, choose a role filename, add the manifest entry in
`@/routes`. Never introduce a new pattern or adopt the segment-based convention.

## Patterns

- `loader` for render-time data, `action` for route form submissions.
- `redirect`, `data`, `Response`, and thrown responses for control flow.
- **Public SSR data goes through oRPC** — `routes/public/**` loaders and `src/root.tsx` call the
  `content.*` procedures via `createSsrCaller` (`@/server/http/ssr-caller`), an in-process router
  client bound to the per-request `HandlerContext`. Loaders stay one-liners: `unwrapListing(...)`
  (home/tag/category/search) and `unwrapDetail(...)` (post/page detail) map the output union back
  to the URL contract — `redirect` → thrown 301/302, `not-modified` → thrown 304,
  `ORPCError('NOT_FOUND')` → `notFound()`. Detail loaders fire `content.comments.byKey` and
  `webmention.list` only on the ok branch, chained off the critical payload's `commentKey`
  (un-awaited, so comments/webmentions still stream via `<Await>`; never speculatively — a
  304/301/404 read costs zero comments work). The root loader calls `content.bootstrap()` with no
  args — the theme cookie is parsed inside the procedure. The exact `@/server/*` import whitelist
  for public routes + root is pinned by the boundaries contract
  test (`ssr-caller`, `loaders/route-exports`, `infra/http/*`, plus `render/warmup/*` for root).
- **Admin SSR data goes through oRPC too** — `routes/admin/**` and `routes/editor/**` loaders
  compose the domain endpoints (`account.*`, `comments.*`, `analytics.*`, `admin.*` — added in
  `shared/contracts/admin.ts`) via the same `createSsrCaller` (which also returns `viewer`/`session`
  for the route-level `requireRole` gates and `isCurrent` projections). Loaders keep the
  `requireRole` gate, do their own `Promise.all` composition (role-conditional branches — e.g. the
  dashboard's admin-only analytics/moderation reads), and translate `ORPCError` codes back to
  Responses (`NOT_FOUND` → `notFound()`, `SERVICE_UNAVAILABLE` → the historical 503 texts). There
  is no page-level aggregate group — orchestration stays in the loaders. Loaders whose ONLY job is
  the role gate (`getRequestContext` → `requireRole` → `return null`) collapse to
  `export const loader = guardOnlyLoader('<role>')` from `@/server/http/request-context`; loaders
  that also fetch data keep the hand-written `requireRole(viewer ?? undefined, '<role>')` line. The
  boundaries test pins
  the admin/editor whitelist (`ssr-caller`, `request-context`, `domains/auth/rbac`, `infra/http/*`)
  and the auth whitelist (signin/setup authentication-flow orchestration, which deliberately stays
  direct: `domains/auth/*`, `domains/comments/services/public-query`, `domains/settings/install-gate`,
  `http/loaders/signin`, `request-context`, `infra/rate-limit`).
- **Non-page requests** (API, feeds, sitemap, generated images) are served by Hono native routes
  mounted in `server.ts`, NOT React Router resource routes.
- Public URLs and physical paths stay stable — route ids derive from the file path.
- Route components accept plain props and never reach back into `server/*` inside the JSX tree.

## Content patterns

- `post` + `content` → `/posts/:slug`; `page` + `content` → `/:slug`. Both rendered via
  `<PortableTextBody>`; public URLs use `slug`, not internal id. Custom blocks in `@/ui/pt/blocks/`.
- `visible=false` posts are hidden from the public home and random-post widgets but stay in
  archives, tags, search, sitemap, feeds, and category/tag listings. Full gate rules:
  `src/server/AGENTS.md` → Content.

## Page draft preview

- `routes/public/page/detail.tsx` paints a red admin-only badge via `PageDetailBody`'s
  `draftMarker` prop: `'draft' | 'unpublished-draft' | 'published-draft' | null`.
- Catalog miss → anonymous 404, admin sees latest draft (**【草稿】**).
- Catalog hit + `?draft=true` → anonymous ignores; admin sees **【未发布的草稿】** (newer draft
  exists) or **【已发布的草稿】** (latest revision IS published).
- Service: `loadDraftPreviewBySlug(db, pageLifecycleAdapter, slug)`
  (`@/server/domains/content/lifecycle`) → `{ preview, hasNewerDraft }`. Access rule lives on the
  entity adapter (`canPreviewDraft`): pages admin-only, posts author+ (mounted in the post detail
  route).

---

## Manifest anchors

Each manifest block has an anchor comment pointing at a section below. Multi-paragraph rationale
goes here, not in `routes.ts`.

### A. Public layout (`routes/public/layout.tsx`)

**Pathless** layout wrapping every public URL. Owns `<BaseLayout>`, which **statically imports
`public.css`**: React Router only emits `<link rel="stylesheet">` for stylesheets reachable from
the matched route module graph, so the static import guarantees a styled first paint. **Do not**
lazy-load `public.css` from a child route or move it into a regular component — both reintroduce
FOUC. Admin / login / install / API routes live **outside** this layout so their bundles skip the
public stylesheet cascade; the admin / auth / editor layouts import the separate `admin.css`
entry instead (see `src/styles/AGENTS.md` → Entry structure).

### B. Splat catch-all inside the public layout

```ts
route('*', 'routes/public/not-found.tsx'),
```

The splat MUST stay last inside `public/layout.tsx`. `*` is the lowest-priority match, firing only
for paths nothing else handles — multi-segment WordPress probes (`/wp-content/plugins/x.php`,
`/cgi-bin/test`). Single-segment `.php` / `cgi-bin` probes hit `:slug` first and are intercepted
inside `routes/public/page/detail.tsx` (see the wp-decoy helper).

### C. Resource routes outside the public layout

Resource routes sit **outside** `public/layout.tsx`: no `<Outlet />` chrome, no `<BaseLayout>`,
no `public.css` in their bundle. Each returns a `Response` directly from a `loader` (GET) or
`action` (POST/PATCH/DELETE).

### D. Feed URLs (Hono resource router)

The six public feed URLs are served by `feedRouter` (`src/server/http/resources/feed.ts`), mounted
at the root in `src/server/http/middleware-pipeline.ts` (`app.route('/', feedRouter)`). They do
**not** appear in `routes.ts`:

| URL                     | Handler scope             |
| ----------------------- | ------------------------- |
| `/feed`                 | site-wide RSS             |
| `/feed/atom`            | site-wide Atom            |
| `/cats/:slug/feed`      | `{ category: slug }` RSS  |
| `/cats/:slug/feed/atom` | `{ category: slug }` Atom |
| `/tags/:slug/feed`      | `{ tag: slug }` RSS       |
| `/tags/:slug/feed/atom` | `{ tag: slug }` Atom      |

Each handler pins its taxonomy scope at compile time and passes the `slug` param straight into
`generateFeeds` — no URL-sniffing helper. Responses are rate-limited (`tryResourceRateLimit`) and
cached through the cache module's `through` verb (`feed` declaration) with a namespaced key
(`cat:<slug>` / `tag:<slug>` / `all`) so a category slugged `all` can't collide with the site-wide
feed. New scope → new `.get()` pair stating its scope inline.

### E. API routes (Hono layer)

All internal API endpoints live in the Hono server (`src/server/http/`) as oRPC procedures. They do
**not** appear in `routes.ts` — the manifest only contains page routes.

### F. Auth split-screen layout (`routes/auth/layout.tsx`)

Owns the split-screen layout shared by login and the install flow — independent of the admin SPA
shell.

### G. admin SPA shell (`routes/admin/layout.tsx`)

Owns its own chrome (sidebar + topbar), opts out of `BaseLayout` via `handle.layout = 'admin'`,
and does **not** reuse the auth split-screen layout (F).

### H. Settings sub-layout (`routes/admin/settings/layout.tsx`)

Wraps the single `/admin/settings` page, hydrates the full `BlogSettingsBundle` once, and exposes
`{ bundle, timeZones, masks }` (plus the admin parent context) via `useOutletContext()`. Asserts
the bundle invariant up front so the page never handles a partial setup.
