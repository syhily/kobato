# Routes conventions

`apps/kobato/src/routes/` holds route modules — loader / action / meta / component orchestration. Read session/context at the perimeter, call orchestrators (`@kobato/server/http/loaders/*`, domain-surface services), project DTOs through the shared leaves, render with `@kobato/web-admin` / `@kobato/web-public` components. No DB queries, cache access, or markdown parsing inline — never import `@kobato/db/operations/*` (package-dag contract test). `routes.ts` is the URL contract; URLs and physical paths stay stable. Non-page requests (API, feeds, sitemap, generated images) are Hono routes in `server.ts`; components take plain props, never `server/*` in JSX.

**Public routes and the root loader are the exception**: both read `content.*` via `createSsrCaller` (`@kobato/server/http/ssr-caller`), never domain services or `server/http/loaders/*`.

## Route trees

Four nested trees, each with its own `routes/<tree>/layout.tsx`:

- `routes/public/` — `home`, `archives`, `categories`, `category/list`, `tag/list`, `search/list`, `post/detail`, `page/detail`, `not-found`.
- `routes/auth/` — split-screen login + install: `signin`, `setup/index`.
- `routes/admin/` — admin SPA: `dashboard`, `comments`, `me/*`, `security/*`, `taxonomy/*`, `library/*`, `pages/index`, `posts/*`, `analytics/*`, `settings/*`.
- `routes/editor/` — standalone editing shell (`post/{new,edit,analytics}`, `page/{new,edit}`); its own layout keeps editor chrome free of admin SPA chrome.

## File naming

Neither `_index.tsx` nor `($slug).tsx` is used: `routes.ts` is the manifest, files are named by **role**.

| Role file             | Meaning                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `<area>/layout.tsx`   | Layout — chrome, error boundary, revalidation policy.              |
| `<entity>/detail.tsx` | Single resource (`public/post/detail.tsx`).                        |
| `<entity>/list.tsx`   | Paginated listing, mounted twice (`/cats/:slug` AND `/page/:num`). |
| `<entity>/index.tsx`  | The bare-prefix admin page.                                        |
| `<entity>/new.tsx`    | Admin create form; `edit.tsx` serves `<entity>/:id/edit`.          |
| `<area>/<role>.tsx`   | Flat role in an area — `public/home.tsx`, `auth/signin.tsx`.       |

Adding a route: pick the area directory, choose a role filename, add the manifest entry in `@/routes`; never introduce a new pattern.

## Patterns

- `loader` for render-time data, `action` for form submissions; `redirect`, `data`, `Response`, and thrown responses for control flow.
- **All SSR data goes through oRPC.** Public loaders and `src/root.tsx` call `content.*` via `createSsrCaller` — loaders stay one-liners: `unwrapListing` / `unwrapListingPayload` / `unwrapDetail` map the output union to the URL contract (`redirect` → thrown 301/302, `not-modified` → thrown 304, `ORPCError('NOT_FOUND')` → `notFound()`). Listing loaders forward `if-none-match` and return `data(payload, { headers: { ETag } })`.
- Detail loaders fire `content.comments.byKey` and `webmention.list` only on the ok branch, un-awaited off `commentKey` so they stream via `<Await>`; never speculatively. The detail procedure fingerprints the comment rows before answering 304 so a stale stored response cannot hide edits.
- The root loader calls `content.bootstrap()` with no args (theme cookie and message scope resolved inside the procedure); `shouldRevalidate` refreshes it on public ↔ workspace navigation and every form action. Root middleware `[traceRouteMiddleware]` adds the document/`.data` span and must stay in the root module, not per-route.
- The root loader projects `activeFrontendRum()` as `rum` once all frontend gates pass; withheld responses omit the key entirely — no null placeholder, server authorization header, OpenObserve endpoint, or RUM client token. `App` mounts `useRum(loaderData.rum ?? null)` once.
- Admin/editor loaders compose `account.*`, `comments.*`, `analytics.*`, `admin.*` via the same `createSsrCaller` (which also returns `viewer`/`session` for `requireRole` gates and `isCurrent`). They keep `requireRole`, compose with their own `Promise.all`, and map `ORPCError` codes (`NOT_FOUND` → `notFound()`, `SERVICE_UNAVAILABLE` → the historical 503 texts); no page-level aggregate group exists. Gate-only loaders collapse to `guardOnlyLoader('<role>')` from `@kobato/server/http/request-context`.
- Boundaries whitelists — public+root: `ssr-caller`, `route-cache-headers`, `infra/http/*` (+ `render/warmup/*`, `infra/trace/react-router`, `infra/trace/config`); admin/editor: `ssr-caller`, `request-context`, `domains/auth/rbac`, `infra/http/*`; auth (direct): `domains/auth/*`, `domains/comments/services/public-query`, `domains/settings/install-gate`, `http/loaders/signin`, `request-context`, `infra/rate-limit`.

## Content patterns

- `post` + `content` → `/posts/:slug`; `page` + `content` → `/:slug`. Both render the saved `bodyHtml` projection through `DetailBodyChrome` (see `packages/web/admin/src/ui/AGENTS.md` → Content editors); public URLs use `slug`, not internal id.
- `visible=false` posts are hidden from the public home and random-post widgets but stay in archives, tags, search, sitemap, feeds (`packages/server/AGENTS.md` → Content).

## Page draft preview

- `routes/public/page/detail.tsx` paints a red admin-only badge via `PageDetailBody`'s `draftMarker`: `'draft' | 'unpublished-draft' | 'published-draft' | null`.
- Catalog miss → anonymous 404, admin sees latest draft (**【草稿】**); catalog hit + `?draft=true` → anonymous ignores, admin sees **【未发布的草稿】** (newer draft) or **【已发布的草稿】** (latest revision IS published).
- `loadDraftPreviewBySlug` → `{ preview, hasNewerDraft }`; the access rule is on the entity descriptor (`canPreviewDraft(viewer, meta)`): pages admin-only, posts author+ AND the post's `authorId`.

## Manifest anchors

- **A. Public layout (`routes/public/layout.tsx`)** — **pathless** layout wrapping every public URL; owns `<BaseLayout>` and the layout-level **`import '@/styles/public.css'`** (styled first paint). **Do not** lazy-load `public.css` from a child route or move it into a regular component — FOUC. Route modules never import `cards.css`, web partials, or `ui.css` directly: the app entry already composes the partials, and the root imports `ui.css` eagerly as the document's first stylesheet. Admin / login / install routes stay outside and import `@/styles/admin.css`.
- **B. Splat catch-all** — `route('*', 'routes/public/not-found.tsx')` MUST stay last inside `public/layout.tsx`: `*` fires only for paths nothing else handles (multi-segment WordPress probes); single-segment `.php` / `cgi-bin` probes hit `:slug` first and are intercepted in `routes/public/page/detail.tsx` (wp-decoy helper).
- **C. Resource and API routes** — resource routes sit outside `public/layout.tsx` and return a `Response` from a `loader` (GET) or `action` (POST/PATCH/DELETE); internal API endpoints are Hono oRPC procedures in `packages/server/src/http/`, so the manifest holds page routes only.
- **D. Feed URLs** — six URLs from `feedRouter`, mounted at the root; none appear in `routes.ts`: `/feed`, `/feed/atom`; `/cats/:slug/feed(+/atom)`; `/tags/:slug/feed(+/atom)`. Handlers pin their taxonomy scope at compile time, are rate-limited, and cache through the `feed` bucket keyed `cat:<slug>` / `tag:<slug>` / `all`, so a category slugged `all` can't collide. New scope → new `.get()` pair stating its scope inline.
- **F. Auth split-screen layout** — shared by login and the install flow, independent of the admin SPA shell.
- **G. admin SPA shell** — own chrome (sidebar + topbar), opts out of `BaseLayout` via `handle.layout = 'admin'`, does not reuse the auth layout.
- **H. Settings sub-layout** — wraps `/admin/settings`, hydrates the full `BlogSettingsBundle` once, exposes `{ bundle, timeZones, masks }` via `useOutletContext()`, and asserts the bundle invariant up front.
