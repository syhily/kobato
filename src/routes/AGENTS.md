# Routes conventions

`src/routes/` contains route modules — loader / action / meta /
component orchestration. Read session/context at the perimeter, call
into `server/`, project DTOs through `shared/`, render with `ui/`. No
DB queries, Redis access, or markdown parsing inline.

Route modules live alongside resource routes (feeds, sitemap, OG
images, JSON APIs) under the same folder so the per-URL contract is
obvious from the file system.

This file is the long-form companion to the **route manifest**
declared in `@/routes`. The manifest itself stays terse so the URL
table reads top-to-bottom; reach for this file when you need the
**why** behind a particular `layout()`, route ordering, or `id`
disambiguator.

---

## Route trees

Page modules grouped into four nested trees, each with its own layout
(`routes/<tree>/layout.tsx`):

- `routes/public/` — public site. Layout + `home`, `archives`,
  `categories`, `category/list`, `tag/list`, `search/list`,
  `post/detail`, `page/detail`, `not-found`.
- `routes/auth/` — split-screen login + install: `signin`,
  `setup/index` (`/admin/setup`), `setup/settings`
  (`/admin/setup/settings`).
- `routes/admin/` — admin SPA. `dashboard`, `comments`,
  `me/{profile,comments,sessions}`,
  `security/{sessions,audit-log,users/{index,detail}}`,
  `taxonomy/{categories,tags}`,
  `library/{images,music,branding,friends}`, `pages/index`,
  `posts/{index,analytics}`,
  `analytics/{layout,overview,realtime,mentions}`,
  `settings/{layout,…}` — one file per settings section.
- `routes/editor/` — standalone immersive editing shell (split from
  `routes/admin/`). `post/{new,edit,analytics}`, `page/{new,edit}`. Owns
  its own layout so the editor chrome is free of admin SPA chrome.

## File naming

We do **not** use React Router's segment-based filename convention
(`_index.tsx`, `($slug).tsx`, `…_._archive.tsx`). The URL is the
contract — `routes.ts` is the manifest and the filesystem is just
storage. Instead, route modules are **grouped by area into
sub-directories**, and within each directory each file is named by
its **role**:

```
src/routes/
├── public/        # everything wrapped by public.layout
│   ├── layout.tsx              # the chrome layout itself
│   ├── home.tsx / archives.tsx / categories.tsx / not-found.tsx
│   ├── category/list.tsx       # /cats/:slug + /cats/:slug/page/:num
│   ├── tag/list.tsx            # /tags/:slug + paged
│   ├── search/list.tsx         # /search/:keyword + paged
│   ├── post/detail.tsx         # /posts/:slug
│   └── page/detail.tsx         # /:slug
├── auth/          # public split-screen layout: login + install
│   ├── layout.tsx
│   ├── signin.tsx
│   └── setup/{index,settings}.tsx
└── admin/      # the admin SPA shell
    ├── layout.tsx, dashboard.tsx, welcome.tsx, …
    ├── security/users/{index,detail}.tsx
    ├── taxonomy/{categories,tags}.tsx
    ├── library/{images,music,branding,friends}.tsx
    ├── my/{profile,comments,sessions}.tsx
    ├── pages/{index,new,edit}.tsx
    ├── posts/{index,new,edit}.tsx
    ├── analytics/{layout,overview,realtime}.tsx
    └── settings/{layout,index,general,assets,…}.tsx
```

Conventions inside an area directory:

| Role file                | Meaning                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `<area>/layout.tsx`      | Pathless or pathed layout — owns chrome, error boundary, and revalidation policy for its children.                    |
| `<entity>/detail.tsx`    | Single-resource page (e.g. `public/post/detail.tsx`, `public/page/detail.tsx`, `admin/security/users/detail.tsx`).    |
| `<entity>/list.tsx`      | Paginated listing — the same module is mounted twice in `routes.ts` (e.g. `/cats/:slug` AND `/cats/:slug/page/:num`). |
| `<entity>/index.tsx`     | The bare-prefix admin page when a sibling `new.tsx`/`edit.tsx`/`detail.tsx` already lives in the same directory.      |
| `<entity>/new.tsx`       | Admin create form (`/admin/<entity>/new`).                                                                            |
| `<entity>/edit.tsx`      | Admin edit form (`/admin/<entity>/:id/edit`).                                                                         |
| `<area>/<role>.tsx`      | Flat role within an area — e.g. `public/home.tsx`, `public/not-found.tsx`, `admin/welcome.tsx`, `auth/signin.tsx`.    |
| `<area>/redirect.<x>.ts` | Tiny redirect-only resource route (e.g. `my/redirect.profile.ts`).                                                    |

When you add a new route, pick the area directory it belongs to,
choose a role filename from the table above, and add the manifest
entry in `@/routes`. Do not introduce a fifth pattern, and **never**
adopt React Router's segment-based filename convention.

---

## Patterns

- Use `loader` for render-time data, `action` for route form submissions.
- Use `redirect`, `data`, `Response`, and thrown responses for control
  flow.
- **Non-page requests** (API, feeds, sitemap, generated images) are
  served by Hono native routes mounted in `server.ts`, NOT React Router
  resource routes.
- Public URLs and physical paths stay stable — React Router derives
  route ids from the file path.
- Route components must accept plain props and not reach back into
  `server/*` inside the JSX tree.

## Content patterns

- `post` + `content` → `/posts/:slug`. `page` + `content` → `/:slug`.
  Both rendered via `<PortableTextBody>`. Public URLs use `slug`, not
  internal id.
- Custom block components in `@/ui/pt/blocks/`.
- `visible=false` posts are hidden from the public home and random-post
  widgets but stay in `/archives`, `/tags/:slug`, `/search/:keyword`,
  `sitemap.xml`, feeds, and category/tag listings and counts.
  Future-dated posts stay excluded until publish time.
- **Draft post visibility gate.** A post is considered draft (invisible
  to the public) when `status=draft` OR `publishedRevisionId=null`.
  All public queries MUST check both conditions. A post with
  `status=published` but no published revision must NOT appear on the home
  page, in listings, feeds, or sitemap.

## Page draft preview

- `routes/public/page/detail.tsx` paints a red admin-only badge via
  `PageDetailBody`'s `draftMarker` prop.
- Catalog miss → anonymous 404, admin sees latest draft with **【草稿】**.
- Catalog hit + `?draft=true` → anonymous ignores; admin sees overlay
  with **【未发布的草稿】** (newer draft exists) or **【已发布的草稿】**
  (latest revision IS the published one).
- Discriminator:
  `'draft' | 'unpublished-draft' | 'published-draft' | null`.
  Service is `loadDraftPreviewBySlug(db, pageLifecycleAdapter, slug)`
  (`@/server/domains/content/lifecycle`) returning
  `{ preview, hasNewerDraft }`.

---

## Manifest anchors

The route manifest in `@/routes` is intentionally short (≈90
non-blank lines). Each block has an anchor comment that points back
to one of the sections below. If you find yourself wanting to write a
multi-paragraph rationale inside the manifest itself, write it here
instead and leave a single-line pointer in `routes.ts`.

### A. Public layout (`routes/public/layout.tsx`)

`public/layout.tsx` is a **pathless** layout (`layout(file, …)`) that
wraps every public-facing URL.

It owns the `<PublicChrome>` wrapper which **statically imports
`public.css`**. React Router only emits `<link rel="stylesheet">`
tags into the SSR `<Links />` output for stylesheets reachable from
the matched route module graph, so a static import inside the layout
guarantees the very first paint is fully styled. **Do not** lazy-load
`public.css` from a child route or move it into a regular component —
both would reintroduce FOUC for the public surface.

The admin / login / install / API routes live **outside** this
layout on purpose: the admin SPA chunk and the JSON resource
routes must not pull the public stylesheet cascade into their
bundles.

### B. Splat catch-all inside the public layout

```ts
route('*', 'routes/public/not-found.tsx'),
```

The splat MUST stay last inside `public/layout.tsx`. React Router
treats `*` as the **lowest-priority** match, so this only fires for
paths nothing else handles — multi-segment WordPress probes such as:

- `/wp-content/plugins/x.php`
- `/cgi-bin/test`
- `/wp-includes/wlwmanifest.xml`

Single-segment `.php` or `cgi-bin` probes hit `:slug` first and are
intercepted inside `routes/public/page/detail.tsx` (see the wp-decoy
helper).

### C. Resource routes outside the public layout

Resource routes (feeds, sitemap, generated images, JSON APIs) sit
**outside** `public/layout.tsx`. They never render `<Outlet />`
chrome, never import `<PublicChrome>`, and must not pull
`public.css` into their bundle. Each one returns a `Response`
directly from a `loader` (GET) or `action` (POST/PATCH/DELETE).

### D. Feed URLs (Hono resource router)

The six public feed URLs are served by a single Hono router,
`feedRouter` in `src/server/http/resources/feed.ts`, mounted at the
root in `src/server/http/middleware-pipeline.ts` (`app.route('/',
feedRouter)`). They do **not** appear in `routes.ts`:

| URL                     | Handler scope             |
| ----------------------- | ------------------------- |
| `/feed`                 | site-wide RSS             |
| `/feed/atom`            | site-wide Atom            |
| `/cats/:slug/feed`      | `{ category: slug }` RSS  |
| `/cats/:slug/feed/atom` | `{ category: slug }` Atom |
| `/tags/:slug/feed`      | `{ tag: slug }` RSS       |
| `/tags/:slug/feed/atom` | `{ tag: slug }` Atom      |

Each handler pins its taxonomy scope at compile time and passes the
`slug` route param straight into `generateFeeds` — there is no
URL-sniffing helper. Responses are rate-limited
(`tryResourceRateLimit`) and cached through `feedCacheFor` with a
namespaced key (`cat:<slug>` / `tag:<slug>` / `all`) so a category
slugged `all` can never collide with the site-wide feed. When you add
a new scope, add a new `.get()` pair that states its scope inline —
do not reintroduce a scope-from-URL helper.

### E. API routes (Hono layer)

All internal API endpoints live in the Hono server (`src/server/http/`)
and are mounted as oRPC procedures. They do **not** appear in
`routes.ts` — the React Router manifest only contains page routes.

### F. Auth split-screen layout (`routes/auth/layout.tsx`)

`routes/auth/layout.tsx` owns the public-facing left/right
split-screen layout shared by login, the stage-1 install (admin
sign-up), and the stage-2 install (settings). These three routes
share the same chrome but are **independent** of the admin SPA
shell.

### G. admin SPA shell (`routes/admin/layout.tsx`)

The SPA admin shell owns its own chrome (sidebar + topbar) under
`routes/admin/layout.tsx`. It opts out of `BaseLayout` via
`handle.layout = 'admin'` and does **not** reuse the public
login/install split-screen layout from section F.

### H. Settings sub-layout (`routes/admin/settings/layout.tsx`)

Twelve `/admin/settings/*` URLs share a single sub-layout that
hydrates the full `BlogSettingsBundle` once and exposes the
`{ settings, bundle, timeZones }` triple via `useOutletContext()`.
The layout also asserts the bundle invariant up front (see
`SettingsBundle` type) so child routes never have to handle a
partial setup.
