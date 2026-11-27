# ADR-0011: Front-end packages by what they may import — `web/{ui,kit,admin}`, four shared leaves, a mount-only `kobato`, and `tools/` by purpose

- Status: **accepted** 2026-11-27 and being implemented: adoption steps 1 to 4 have landed (the comment surface and the
  shared composer platform to Inkling, the root-data label hook to the workspace UI; the shell modules and the document
  shell to `@kobato/ui`, both roots onto it; `use-notifications` to `@kobato/api/browser`, §1's rule pinned;
  `startKobato` in `@kobato/server/bootstrap` with the workspace-serving module in `@kobato/server/http`, the app entry
  thinned to the call; the workspace — source, tests, and arch pins — in `packages/web/admin` as its own React Router
  SPA project with no route warmup, `apps/kobato` the backend behind a Vite SSR dev host, three dev commands, the client
  build located through the package). Steps 5–6 follow. It amends [ADR-0009](0009-optional-headless-frontends.md): §1
  "Where the code lives" and the Implementation notes' "Packages" and "Builds" paragraphs are superseded here; every
  other section of ADR-0009 stands.
- Date: 2026-11-27
- Related: [ADR-0009](0009-optional-headless-frontends.md) (the two deliverables and the one contract),
  [CONTEXT.md](../../CONTEXT.md) (`kobato`, `workspace`, `sayaka`).

## Context

ADR-0009 made the product two deliverables and left one package for the modules both render — the cross-surface kit
`@kobato/web-kit` (`packages/web/kit`) — while the admin UI was absorbed into `apps/kobato/src/ui`. Measured after the
split landed, a package split by _consumer_ ("both surfaces need it") rather than by _kind_ shows six symptoms, and the
workspace carries one piece of public-site machinery it does not need.

- **The kit is not cross-surface.** Of 2,601 lines, sayaka imports 17 modules (40 import lines) and the workspace UI 21
  (112 lines). `ui/shared/editor/*` (the editor platform) and `ui/lib/toast-api-error` have no direct sayaka import, and
  `inkling-demo` reaches the package for a one-line stylesheet partial.
- **Two tiers of "shared front-end code".** `@kobato/ui` and the kit are told apart by a judgment call — "a module both
  consuming surfaces need lives in the kit, a UI primitive in ui" — and each has its own `lib/`.
- **A hidden interface.** Kit hooks read the consumer's root route (`useRouteLoaderData('root')` for `csrfToken`,
  `nowIso`, `i18n.inklingLabels`), so a shared hook's interface includes a root-loader shape only its consumer knows.
  Both roots render the same document `Layout` (98 and 110 lines, near-identical) and mount the same provider stack.
- **The comment editor is not where the comment model is.** Inkling owns `headless/comment-schema` — sayaka imports it
  to validate a submit — while the composer sits in the kit. An external frontend author gets the contract and the
  model, and no editor.
- **Eight shared leaves, four of them at the floor.** `auth` (286 lines), `assets` (367), `distribution` (227), and
  `sanitize` (471) depend on no workspace package or on `i18n` only, yet each carries a package.json, tsconfig,
  AGENTS.md, path-table rows, and a version to sync. No module is misplaced — of 81 modules, 11 have a single consumer
  outside their leaf, all registry internals or modules with one product consumer — so the cost is ceremony and names,
  not structure.
- **`apps/kobato` is a front-end that boots a server.** 41,620 of its 44,306 lines are workspace UI. Of the rest,
  `src/server.ts` is a 101-line boot sequence importing 24 `@kobato/server` modules (ten of them side-effect imports
  that register schedulers and maintenance) and carrying Vite HMR state, although `packages/server` names `bootstrap/`
  its composition root; the app also assembles its own Hono pipeline and the workspace shell, and its build is a React
  Router SPA build followed by a backend bundle that overwrites `build/server/index.js`.
- **The workspace warms routes it does not need.** Route warmup is a public-site device: anonymous visitors, an empty
  cache, a first navigation. In the workspace it preloads 166 chunks at idle after an admin lands — 2.6 MB raw, 890 KB
  gzipped — for the one session per browser that is cache-cold, and its 100 KB idle cap does not apply there: the plugin
  keys chunk sizes as `/assets/<file>`, the workspace's manifest says `/admin/assets/<file>`, and a 1 MB chunk sits on
  the idle list.

## Decision

### 1. `packages/web/` holds three front-end packages, split by what they may import

| Package                           | Holds                                                     | May import                                         |
| --------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| `@kobato/ui` (`web/ui`)           | the design system and the document shell                  | `@kobato/settings`, `@kobato/i18n`, `@kobato/base` |
| `@kobato/web-kit` (`web/kit`)     | the features both front-ends render that call a procedure | `@kobato/ui`, `@kobato/api`, `@kobato/inkling`     |
| `@kobato/web-admin` (`web/admin`) | the workspace: the admin, editor, and auth SPA            | the two rows above and the shared leaves           |

`@kobato/ui` moves from `packages/ui`; its name and its import specifiers do not change. `@kobato/web-admin` is new
(§4). `@kobato/web-admin` imports neither sayaka nor `@kobato/server` in production source, as today's pins already
require; its test tree is the one exception (Consequences).

The rule that replaces the judgment call: **`@kobato/ui` imports no `@kobato/api` module. A front-end module that calls
a procedure is a kit module or an app's own.** Nothing else separates the two packages.

What leaves the kit:

- **Document-shell modules → `@kobato/ui`:** `blog-settings-context`, `LocaleSyncProvider` with `locale-sync`,
  `chunk-error` / `chunk-reload` / `ChunkReloadOverlay`, `BrandLogo`, `Image` with its hooks, and the chrome clock
  (`use-chrome-clock`, landed as `@kobato/ui/lib/use-document-clock` over the shell's document facts). None imports
  `@kobato/api`; 27 of sayaka's 40 kit import lines are these.
- **The comment composer → `@kobato/inkling/comment`** (§2).
- **The shared composer platform → Inkling's public API, the root-data label hook → the workspace:** what both composers
  need becomes Inkling's deliberately-public API on the React barrel, never a per-host copy — `useEditorSurface` with
  `useEditorBodyReset`, `excludeBaseNodes`, `blockQuoteAsideCycle`, the per-locale label loader `loadInklingLabels`, and
  `InklingHostComposer`, the host-facing composer that binds `@kobato/ui`'s locale and theme and takes `labels` as a
  prop. Only the label hook `useKobatoInklingLabels` moves to the workspace UI (`ui/shared/`, beside the comment dialogs
  and the page editor that read the same payload) — the workspace's typed reader of the shell's `labels` fact
  (`useDocumentLabels`), never a reader of the React Router root loader. Inside Inkling the comment composer mounts
  `InklingHostComposer` and takes labels as a prop or from `loadInklingLabels` (§2); the workspace hands its page and
  comment editors the root table through the `labels` prop.
- **`use-notifications` → `@kobato/api/browser`** (§3).

The kit keeps what calls the wire from both front-ends — the notifications family, `use-logout`, `toast-api-error`: 957
lines in 10 source files, with `use-notifications` (180 lines) in `@kobato/api` (§3). With the shell modules in
`@kobato/ui` and `use-notifications` in `@kobato/api`, sayaka imports three kit modules in four import lines —
`use-logout`, `LazyNotificationsDrawer` (the drawer and its chunk warm-up, two lines), and `NotificationBadge`.

**The document shell.** `@kobato/ui` gains one family (`components/document-shell/`: `DocumentShell`,
`DocumentProviders`, the head planner) that renders a document and owns root route data: fonts and preconnects, theme,
locale and messages, the settings contexts, locale sync, and the hooks that hand document facts (`nowIso`, the CSRF
token, the label payload) to shared modules. A shared hook no longer calls `useRouteLoaderData`. The shell takes
document facts, never `content.bootstrap`'s DTO — each app maps its bootstrap to them — so `@kobato/ui` stays free of
`@kobato/api`.

### 2. The comment editor belongs to Inkling

`@kobato/inkling/comment` is the comment surface beside the comment model: the composer with its trimmed node set, the
markdown transformers filtered to that node set, the legacy-math downgrade, the plain-text reader, the stored-body
renderer, and the lazy mount with its placeholder and the iOS zoom lock. Labels arrive as they do today — a prop, or one
chunk per locale loaded on demand; reading labels off the root route is workspace glue and stays in the workspace. An
external frontend author composes a comment with the public contract and this one module.

### 3. `@kobato/api/browser` holds the contract's data hooks

`use-notifications` is 180 lines of TanStack Query over `public.notifications.*` with the cache patching beside it, and
imports no UI package. It moves to `src/browser/`. The rule for that directory grows one sentence: **a browser hook
imports the contract, the client, and TanStack Query — never a UI package (`@kobato/ui`, `@kobato/web-kit`, and the
`@kobato/inkling` barrel and every Inkling entry but `/headless*`), never message copy (the `@kobato/i18n` message
catalogs, the fallback catalog, and the label tables), never a consumer's route data (React Router).** `toast-api-error`
(sonner, message ids) and the document clock (`use-chrome-clock` when this was written, now
`@kobato/ui/lib/use-document-clock` over document facts) fail it and stay out.

### 4. The workspace is a static project; `kobato` mounts the server and serves it

`packages/web/admin` (`@kobato/web-admin`) is the workspace as a React Router SPA project — `react-router.config.ts`,
`vite.config.ts`, the routes, the root, the UI tree, the document runtime, the styles — whose build is a static client
tree under the `/admin/` base. It lives under `packages/` because it is not deployed on its own: `apps/` holds what is.
`apps/kobato` keeps the backend — `src/server.ts` and the backend Vite config — and no React Router project.

**Three dev commands.** React Router's typegen writes route types to
`<project root>/.react-router/types/<app directory>` and types a route outside the app directory as `unknown`, so the
workspace has to be its own project; the single dev server that served both the workspace and the Hono app ends.
`pnpm dev` is the backend — a Vite SSR host for the Hono app, with server HMR. `pnpm dev:admin` is the workspace, on
today's port and URLs, proxying the backend's path families (`/rpc/*`, `/health`, `/ready`). `pnpm dev:public` is
sayaka; its forwarding keeps a single target, the workspace origin, which serves both the workspace and `/rpc/*`, and
`SAYAKA_KOBATO_RPC_URL` still points it at the backend directly when the workspace is not needed.

**The workspace has no route warmup.** sayaka keeps its inline idle script and the manifest that feeds it. The workspace
drops `useRouteWarmup`, its idle script, and its tiers; the manifest contract and the Vite plugin shrink to the public
surface — `tier1`, one tier-2 list, and a cap keyed on the hrefs the manifest carries.

**The build output is found through the package.** `kobato` locates the workspace's client build by resolving
`@kobato/web-admin` — the SEA asset collection and the node-mode static root alike — never through the working
directory. Production is unchanged: one binary, one origin, the workspace under `/admin/*` and `/editor/*`, which sayaka
keeps forwarding. `@kobato/web-admin` remains a banned specifier in sayaka.

### 5. `@kobato/server` owns the boot sequence

`startKobato(options)` in `bootstrap/` owns the order and the run-once state: migrations and secrets, settings
hydration, observability provisioning and retention, the job registry and the schedulers, the setup token, the process
pool, and the HMR-once guards. Serving the workspace — static assets, the nonce-CSP shell document, the `/admin/*` and
`/editor/*` fallbacks — is an HTTP-perimeter module of the same package taking an assets root.
`apps/kobato/src/server.ts` calls `startKobato`, hands it the workspace build's location, and default-exports the app.

`startKobato({ assetsRoot, listener, onListening? })` takes the workspace build's assets root, the listener —
`{ mode: 'bind' }` binds the configured host and port; `{ mode: 'host', server }` adopts the HTTP server the host
already runs (the Vite dev server, read from the app-side `globalThis` slot) — and an optional `onListening(server)`
observer; the package registers the listening server with the lifecycle itself. It wraps the app's fetch handler with
the leaked-response handler before anything binds it, so a cold production boot serves the wrapped fetch exactly as the
dev host and a post-restart re-bind do. The workspace-serving module is `http/kobato-app.ts`
(`createKobatoApp(assetsRoot)` and the production listener `listenKobato(app)`) over the pure shell handler
`http/spa-shell.ts`; the listener itself is `infra/http/listener.ts` (`listenHono`), whose one `serve()` options shape —
the configured host and port, `overrideGlobalObjects: false` — the lifecycle's `restartServer` binds too, so a restart
never serves under different options than a cold boot.

### 6. `packages/shared` has four leaves

`i18n`, `base`, `settings`, `catalog`. **`base`** is today's `utils`, `auth`, `assets`, `distribution`, and `sanitize`
as five directories that keep their names; the specifier `@kobato/<leaf>/<module>` becomes
`@kobato/base/<leaf>/<module>` (about 600 import lines, a prefix rewrite). The dependency direction is a line — `i18n` ←
`base` ← `settings` ← `catalog` — and the direction inside `base` is pinned at directory level by the DAG test that
pinned the leaves. No module changes leaf. The name is `base`, not `core`: CONTEXT.md reserves **Core domain** for the
language-backed concepts.

### 7. `tools/` is split by what each package is for

- `font-split` moves to `packages/font-split`. It is the one package under `tools/` that ships; after the move nothing
  under `tools/` does, and the exception in its `AGENTS.md` goes with it.
- The live-instance driver (`pack/src/instance/`) and the Playwright journey support (`pack/src/browser/` with
  `playwright.config.ts`) move to `tools/test/` as `instance/` and `browser/`, imported as `@kobato/test/instance/*` and
  `@kobato/test/browser/*`. `tools/test` is then everything a test needs — fixtures and doubles, the Vitest project
  table, the booted-instance driver, the browser journeys.
- `tools/pack` keeps the SEA pipeline, the Vite plugins, and the release scripts. The process primitives both halves
  used (`pack/src/process.ts`) go with the driver, so `pack` → `test` is the only direction between them.
- `pack/src/vite` gains one front-end config factory: the workspace and sayaka configs become a call with tiers and a
  port, not two copies of the plugin list.
- Scripts anchor their output on the repository root, so Playwright reports and React Router typegen stop landing under
  `tools/` when a script runs from a package directory.
- `trace` and `tsconfig` stay as they are.

## Rejected alternatives

- **Keep the kit as "what both surfaces need" and rename it.** The criterion is the consumer, so every new shared module
  restarts the judgment call, and workspace-only modules keep arriving under a cross-surface banner.
- **One front-end package — `@kobato/ui` absorbs the kit.** The notifications drawer calls procedures; `@kobato/ui`
  would import `@kobato/api` and stop being a design system.
- **Move the kit's shared modules into `@kobato/api`.** Only hooks with no UI dependency qualify (§3); the rest would
  make the contract package depend on a design system and message catalogs.
- **Leave the workspace in `apps/kobato`.** Keeps one dev process and today's build, at exactly the price this ADR
  removes: a backend app that is 94% front-end source, a build of two Vite projects writing one `build/` directory, and
  a boot sequence in the app. The second dev process is the accepted cost.
- **Point `apps/kobato`'s React Router `appDirectory` at the workspace source to keep one dev server.** Route types are
  written relative to the project root, and routes outside the app directory type as `unknown`.
- **Put the backend dev server in front and forward `/admin/*` to the workspace dev server.** Mirrors production, but
  forwards the HMR websocket and every dev-middleware path; the one-way proxy needs no forwarding code.
- **Copy the workspace build into `apps/kobato/build/client`.** A cross-package copy step and a second source of truth
  for the asset root; package resolution is how build-time paths are already anchored.
- **Name the merged leaf `core`.** Collides with Core domain.
- **Keep the comment composer in the kit.** The model, the validation gates, and the editor are one concept; splitting
  them is why an external author can validate a comment but not compose one.
- **Keep the route warmup in the workspace and repair the cap.** A working cap removes four chunks, the 1 MB one among
  them, and leaves about 160 small ones — still downloaded for a session that is cache-cold once per browser, to spare
  one chunk fetch on the first click into each section.

## Consequences

- Dev is three commands; the instance driver's dev boot and the suites that use it follow. `reactRouterHonoServer` keeps
  its sayaka side and loses its kobato-side React Router glue.
- A first navigation into each workspace section waits on its chunk with no pending state — the workspace never had one.
  A pending indicator is the fix if that ever reads as a dead click.
- Paths pinned in tools move with the workspace: the SEA asset collection (`apps/kobato/build/client`). Three stale pins
  are corrected on the way — `components.json` (`tailwind.css`, the sheet the shadcn CLI reads), `oxfmt.config.ts`
  (`sortTailwindcss.stylesheet`, the sheet oxfmt resolves the theme from to sort classes), and `.vscode/settings.json`
  (`tailwindCSS.experimental.configFile`) — named `apps/kobato/src/styles/public.css`, which has lived in sayaka since
  ADR-0009; each now names `packages/web/ui/src/styles/ui.css`, the design system's compilation entry — it carries
  `@import 'tailwindcss'` over the token partial and scans the shadcn components, so all three consumers resolve the
  same theme. The kobato build no longer produces a client tree.
- Tests move with the source they mirror: about 230 files (29,000 lines) to `packages/web/admin/tests`, their own Vitest
  projects, and the workspace arch pins beside them; cross-package pins stay in `apps/kobato/tests/arch`.
  `web-direction` changes its scan root to `packages/web/admin/src/ui`; sayaka's `frozen-admin-set` is untouched — it
  never scanned the workspace, and its roots last changed in step 2, when `packages/api/src/browser` joined. Five moved
  tests keep their `@kobato/server` / `@kobato/db` imports as the documented test-only exception
  (`packages/web/admin/AGENTS.md`): the package declares both as test dependencies and its `src/` imports neither.
- The workspace's `@/` imports (946 in source, 480 in tests) switch to its package specifier; `@/` remains the backend
  app's alias.
- The shared merge rewrites the path table from eight leaves to four and about 45 documentation mentions of the five
  directories.
- The app e2e and browser trees import `@kobato/test/instance/*` and `@kobato/test/browser/*`; `tools/test` gains the
  driver's dependencies; `@kobato/font-split`'s path-table rows follow its directory.
- ADR-0009 is amended as above; the `AGENTS.md` tree follows each step (root, `apps/kobato`, `packages/web` and its
  three packages, `packages/shared`, `tools/`, `tools/pack`, `tools/test`, `apps/inkling-demo`).
- An external frontend author builds comments and reads notifications from the contract plus `@kobato/inkling/comment`
  and the browser data hooks, with no Kobato UI package.

## Adoption

Each step is green on its own — `pnpm run fmt`, `pnpm run lint`, `pnpm test`, `pnpm run build`; steps 3 and 4 add
`pnpm run split:smoke` (step 4 its `--sea` run), step 6 the binary suites.

1. **`packages/ui` → `packages/web/ui`.** Two path-table rows, its two Vitest projects (and the `web-unit` and
   `web-snaps` globs, which would otherwise also match ui's tests, doubling them against `ui-unit` and `ui-snaps`), the
   documentation pins. No specifier changes; the coverage config names no `packages/web` path, so it needs no edit.
2. **The kit re-homes**, in three commits: the comment surface and the shared composer platform to Inkling, the
   root-data label hook to the workspace UI; the shell modules and the document shell to `@kobato/ui`, both roots onto
   it; `use-notifications` to `@kobato/api/browser`. Pin §1's rule.
3. **`startKobato`** and the workspace-serving module land in `@kobato/server`; `apps/kobato/src/server.ts` thins to the
   call.
4. **The workspace moves** to `packages/web/admin`, in one commit: source, tests, and arch pins (the workspace-only ones
   beside it, the cross-package ones in `apps/kobato/tests/arch`); its own Vite and React Router project; the dev
   commands; the SEA asset path; the route warmup leaving it (`src/route-warmup/` and its tests go, the root stops
   mounting `useRouteWarmup` / `RouteWarmupScript`, and the manifest contract and the Vite plugin shrink to the public
   site — `tier1`, one tier-2 list, a cap keyed on the hrefs the manifest carries); the three stale stylesheet pins
   (`oxfmt.config.ts`, `components.json`, `.vscode/settings.json`); the Vitest projects.
5. **The shared leaves merge** into `base`: the prefix rewrite, the path table, the directory-level DAG pin, the
   documents.
6. **`tools/` regroups**: `font-split` into `packages/`; the instance driver, the browser support, and
   `playwright.config.ts` into `tools/test`; the front-end config factory; output paths anchored on the repository root.
