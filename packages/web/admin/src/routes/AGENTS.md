# Routes conventions

`packages/web/admin/src/routes/` holds route modules — client loader / client action / meta / component orchestration.
Every loader and action runs in the BROWSER (SPA mode): data reaches the backend through the `orpc` singleton
(`@kobato/api/browser/client`) only — never `@kobato/server` (pinned by `tests/arch/route-server-surface.test.ts`), no
DB imports, no inline business logic. Render with `@kobato/web-admin/ui` / `@kobato/web-kit`. `routes.ts` is the URL
contract; URLs and physical paths stay stable. Non-page requests are Hono routes in the backend (`@kobato/server`,
booted by `apps/kobato/src/server.ts`); components take plain props, never `server/*` in JSX.

**The root loader is the client bootstrap**: `clientLoader` = `loadRootBootstrap()` (`public.content.bootstrap` through
the one-per-document memo), syncs the CSRF token (`setCsrfToken`) before any child loader fires, redirects
`/admin/setup` (303) while `installState === 'noAdmin'` — except when the navigation is already for `/admin/setup`,
where the setup route's own `clientLoader` owns the installed case — and returns today's shape minus the server-only
fields. There is no `shouldRevalidate` override: React Router's default policy re-runs the root on every plain
navigation, and the fresh bootstrap it loads is the same memoized call the children join, so a stale tab's changes
surface without waiting for a form action.

## Route trees

Three nested trees, each with its own `routes/<tree>/layout.tsx`:

- `auth/` — split-screen login + install: `signin`, `setup/index`.
- `admin/` — admin SPA: `dashboard`, `comments`, `me/*`, `security/*`, `taxonomy/*`, `library/*`, `pages/index`,
  `posts/*`, `analytics/*`, `settings/*`.
- `editor/` — standalone editing shell (`post/{new,edit,analytics}`, `page/{new,edit}`) with its own layout.

The public document trees live in `apps/sayaka` (ADR-0009); kobato answers 404 for every public document URL.

## File naming

Neither `_index.tsx` nor `($slug).tsx` is used: `routes.ts` is the manifest and files are named by **role** —
`<area>/layout.tsx` (chrome, error boundary, revalidation), `<entity>/detail.tsx`, `<entity>/list.tsx`,
`<entity>/index.tsx` (bare-prefix admin page), `<entity>/new.tsx` (+ `edit.tsx`), `<area>/<role>.tsx`. Adding a route:
pick the area directory, choose a role filename, add the manifest entry — never a new pattern.

## Patterns

- `clientLoader` for data, `clientAction` for form submissions — both typed `Route.ClientLoaderArgs` /
  `Route.ClientActionArgs`; `redirect`, `data`, and thrown responses for control flow. SPA mode forbids `loader`,
  `action`, `middleware`, and `headers` exports on non-root routes.
- Guards: gate-only loaders collapse to `export const clientLoader = guardLoader('<role>')`
  (`@kobato/web-admin/lib/guard-loader` — joins the bootstrap memo, then `requireRoleFromBootstrap`: anonymous → signin
  redirect with `redirect_to`, below-role → 403 `data`). Layouts needing more data inline the same two calls.
- Data loaders: `const boot = await awaitRootBootstrap()` then `orpc.<group>.<domain>(...)`; `boot.currentUser` is the
  viewer, `boot.blogSettings` replaces the settings-bundle getters, `boot.i18n` is the locale/messages catalog, and
  `boot.installState` drives the signin/setup 303 gates. Map `ORPCError` codes with `isOrpcErrorWithCode` (`NOT_FOUND` →
  `notFound()` from `@kobato/web-admin/lib/route-status`, `SERVICE_UNAVAILABLE` → a thrown 503 `Response`).
- Actions: the server perimeter enforces CSRF — a failure arrives as a FORBIDDEN `ORPCError` carrying the
  `error.api.csrfFailed` descriptor; `isCsrfFailure` + `toClientActionResult` surface it as an error result, never a
  thrown crash. Auth/setup dispatch results go through `toClientActionResult(result, { locale, messages }, extra)` with
  the bootstrap's i18n; flow cookies ride the RPC response itself, so `redirect(result.to)` carries no headers.
- `auth/signin` and `auth/setup` are oRPC end to end. Each loader and action applies its install gate on
  `boot.installState` — signin throws `redirect('/admin/setup', { status: 303 })` while `noAdmin`, setup throws
  `redirect('/admin/signin', { status: 303 })` once installed — then the signin loader calls `account.auth.status` and
  the setup loader `account.setup.status`; the setup action re-reads the flag from `account.setup.status` instead of the
  session. The whole `account.setup` surface (`status`, `verifyToken`, `install`, `restore`) is `installGateExempt` — it
  IS the pre-install flow, so a fresh instance can drive it while kobato's perimeter still 303s everything else — while
  keeping the CSRF guard and the controller-side install-state re-checks. Dispatch goes to `account.auth.*` /
  `account.passkey.authFinish` / `account.setup.*` through the `orpc` singleton — never the auth domain services
  directly. Every `redirectTo` is re-sanitized inside the controller; setup's verify 429 rides the wire error variant.
  Setup keeps the visible-error priority: the session gate answers before CSRF.

## Manifest anchors

- **Splat, index, and the bare `/` document** — the manifest holds NO page route for `/`; its LAST two entries mount
  `routes/not-found.tsx` outside the three layout groups — the root index route (the bare `/`) and the `*` splat (every
  unmatched URL; explicit id `routes/not-found-splat`, one 404 file). Both loaders throw `notFound()`, so the bare `/`
  and every miss render the root `ErrorBoundary` (`AdminErrorFallback`) at 404. The former public splat and tree moved
  to sayaka (ADR-0009); kobato answers 404 for every public document URL.
- **Resource and API routes** — resource routes are Hono routes in the backend and return a `Response`; internal API
  endpoints are Hono oRPC procedures, so the manifest holds page routes only.
- **Feed URLs** — sayaka's (`apps/sayaka/src/routes`), none in `routes.ts`.
- **Auth split-screen layout** — shared by login and install, independent of the admin SPA shell.
- **admin SPA shell** — own chrome; the admin/editor layouts set `handle.postFonts = true` so the root emits the
  post/code font links.
- **Settings sub-layout** — hydrates the full `BlogSettingsBundle` once over orpc and exposes
  `{ bundle, timeZones, masks }` via `useOutletContext()`.
