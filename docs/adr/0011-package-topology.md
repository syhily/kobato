# ADR-0011: Front-end packages by what they may import — `web/{ui,kit,admin}`, four shared leaves, a mount-only `kobato`, and `tools/` by purpose

- Status: accepted and **implemented** 2026-11-27 — the six Adoption steps landed (the comment surface and the shared
  composer platform to Inkling, the root-data label hook to the workspace UI; the shell modules and the document shell
  to `@kobato/ui`, both roots onto it; `use-notifications` to `@kobato/api/browser`, §1's rule pinned; `startKobato` in
  `@kobato/server/bootstrap` with the workspace-serving module in `@kobato/server/http`, the app entry thinned to the
  call; the workspace — source, tests, and arch pins — in `packages/web/admin` as its own React Router SPA project with
  no route warmup, `apps/kobato` the backend behind a Vite SSR dev host, three dev commands, the client build located
  through the package; the five floor leaves merged into `@kobato/base`; `font-split` in `packages/`, the instance
  driver, the browser support, and the Playwright config in `tools/test`, the front-end config factory, output paths
  anchored on the repository root); see "Implementation notes (2026-11-27)" for where the tree refined the Decision. It
  amends [ADR-0009](0009-optional-headless-frontends.md): §1 "Where the code lives" and the Implementation notes'
  "Packages" and "Builds" paragraphs are superseded here; every other section of ADR-0009 stands.
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
| `@kobato/web-kit` (`web/kit`)     | the features both front-ends render that call a procedure | `@kobato/ui`, `@kobato/api`, and the shared leaves |
| `@kobato/web-admin` (`web/admin`) | the workspace: the admin, editor, and auth SPA            | the two rows above and the shared leaves           |

`@kobato/ui` moves from `packages/ui`; its name and its import specifiers do not change. `@kobato/web-admin` is new
(§4). `@kobato/web-admin` imports neither sayaka nor `@kobato/server` in production source, as today's pins already
require; its test tree is the one exception (Consequences).

The rule that replaces the judgment call: **`@kobato/ui` imports no `@kobato/api` module. A front-end module that calls
a procedure is a kit module or an app's own.** Nothing else separates the two packages.

What leaves the kit:

- **Document-shell modules → `@kobato/ui`:** `blog-settings-context`, `LocaleSyncProvider` with `locale-sync`,
  `chunk-error` / `chunk-reload` / `ChunkReloadOverlay`, `BrandLogo`, `Image` with its hooks, and the chrome clock
  (`use-chrome-clock`). None imports `@kobato/api`; 27 of sayaka's 40 kit import lines are these.
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
locale and messages, the settings contexts, locale sync, and the hooks that hand document facts to shared modules —
`useDocumentClock` (`nowIso`), `useDocumentCsrfToken`, and `useDocumentLabels` (the label payload), under `lib/`. A
shared hook no longer calls `useRouteLoaderData`. The shell takes document facts, never `content.bootstrap`'s DTO — each
app maps its bootstrap to them — so `@kobato/ui` stays free of `@kobato/api`.

### 2. The comment editor belongs to Inkling

`@kobato/inkling/comment` is the comment surface beside the comment model: the composer with its trimmed node set, the
markdown transformers filtered to that node set, the legacy-math downgrade, the plain-text reader, the stored-body
renderer, and the lazy mount with its placeholder and the iOS zoom lock. Labels arrive as they do today — a prop, or one
chunk per locale loaded on demand; reading labels off the root route is workspace glue and stays in the workspace. An
external frontend author composes a comment with the public contract and this one module.

### 3. `@kobato/api/browser` holds the contract's data hooks

`use-notifications` is 180 lines of TanStack Query over `public.notifications.*` with the cache patching beside it, and
imports no UI package. It moves to `src/browser/`. The rule for that directory grows one sentence: **a browser hook
imports the contract, the client, TanStack Query, and the shared leaves — never a UI package (`@kobato/ui`,
`@kobato/web-kit`, and the `@kobato/inkling` barrel and every Inkling entry but `/headless*`), never message copy (the
`@kobato/i18n` message catalogs, the fallback catalog, and the label tables), never a consumer's route data (React
Router).** `toast-api-error` (sonner, message ids) fails it and stays out; the document clock is
`@kobato/ui/lib/use-document-clock` over document facts, not a browser data hook.

### 4. The workspace is a static project; `kobato` mounts the server and serves it

`packages/web/admin` (`@kobato/web-admin`) is the workspace as a React Router SPA project — `react-router.config.ts`,
`vite.config.ts`, the routes, the root, the UI tree, the document runtime, the styles — whose build is a static client
tree under the `/admin/` base. It lives under `packages/` because it is not deployed on its own: `apps/` holds what is.
`apps/kobato` keeps the backend — `src/server.ts`, its build-layout and dev-server helpers under `src/server/`, and the
backend Vite config — and no React Router project.

**Three dev commands.** React Router's typegen writes route types to
`<project root>/.react-router/types/<app directory>` and types a route outside the app directory as `unknown`, so the
workspace has to be its own project; the single dev server that served both the workspace and the Hono app ends.
`pnpm dev` is the backend — a Vite SSR host for the Hono app, with server HMR, on `127.0.0.1:4320`. `pnpm dev:admin` is
the workspace, on `127.0.0.1:4321`, proxying the backend's path families (`/rpc/*`, `/health`, `/ready`) to
`KOBATO_DEV_BACKEND_URL` (default `http://127.0.0.1:4320`). `pnpm dev:public` is sayaka; its forwarding keeps a single
target, the workspace origin, which serves both the workspace and `/rpc/*`, and `SAYAKA_KOBATO_RPC_URL` still points it
at the backend directly when the workspace is not needed.

**The workspace has no route warmup.** sayaka keeps its inline idle script and the manifest that feeds it. The workspace
drops `useRouteWarmup`, its idle script, and its tiers; the manifest contract and the Vite plugin shrink to the public
surface — the manifest is `{ version, tier1, tier2 }`, one tier-2 list, and the idle cap is keyed on the hrefs the
manifest carries, so a base prefix cannot hide an oversized chunk. What both front-ends keep is Vite's dev
`server.warmup.clientFiles`, set by the front-end config factory (§7).

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
`@kobato/base/<leaf>/<module>` (584 import lines, a prefix rewrite). The dependency direction is a line — `i18n` ←
`base` ← `settings` ← `catalog` — and the direction inside `base` is pinned at directory level by the DAG test that
pinned the leaves. No module changes leaf. The name is `base`, not `core`: CONTEXT.md reserves **Core domain** for the
language-backed concepts.

### 7. `tools/` is split by what each package is for

- `font-split` moves to `packages/font-split`. It is the one package under `tools/` that ships; after the move nothing
  under `tools/` does, and the exception in its `AGENTS.md` goes with it.
- The live-instance driver (`pack/src/instance/`) and the Playwright journey support (`pack/src/browser/` with
  `playwright.config.ts`) move to `tools/test/` as `src/instance/` and `src/browser/`, imported as
  `@kobato/test/instance/*` and `@kobato/test/browser/*`. `tools/test` is then everything a test needs — fixtures and
  doubles, the Vitest project table, the booted-instance driver, the browser journeys. Only its Vitest half stays
  product-free; the two live halves are pinned separately (`package-dag.test.ts`): the driver (`src/instance/` with
  `process.ts`) imports exactly `@kobato/settings`, the `@kobato/base/utils` sub-tree, and its own modules, and the
  browser support (`src/browser/`) imports `@playwright/test`, `@kobato/base/utils`, the driver's `client/`, and its own
  modules; the driver never reaches the browser support. The move created one dev-only workspace dependency cycle,
  accepted and documented in `tools/AGENTS.md`: `packages/shared/settings` dev-depends on `@kobato/test` and
  `tools/test` dev-depends on `@kobato/settings` for `instance/seed.ts` and `instance/split-smoke.ts`.
- `tools/pack` keeps the SEA pipeline, the Vite plugins, and the release scripts. The process primitives both halves
  used (`pack/src/process.ts`) go with the driver, so `pack` → `test` is the only direction between them.
- `pack/src/vite` gains one front-end config factory, `frontEndConfig` (`front-end-config.ts`): it assembles the shared
  plugin list (the sanitize engine alias, inline package data, the React Compiler transform, React Router, Tailwind)
  with the application's own plugins around it (`plugins.leading` / `plugins.trailing`), the `__APP_*__` defines, the
  chunk-size limits, the tsconfig path resolution, the route warmup files, and the port. The workspace and sayaka
  configs are each one call — `appDir`, `port`, `identityDir` (default `apps/kobato`), `base`, `server`, `optimizeDeps`,
  `serverEntry`, `ssrExternals` — not two copies of the plugin list; the route tiers belong to sayaka's route-warmup
  plugin alone, since only sayaka mounts a route-warmup plugin (the workspace mounts none, §4), while Vite's dev
  `server.warmup.clientFiles`, set by the factory, applies to both.
- Scripts anchor their output on the repository root, so Playwright reports and React Router typegen stop landing under
  `tools/` when a script runs from a package directory: the Playwright config and `split-smoke.ts` resolve every path
  from `REPO_ROOT` (`@kobato/test/repo-root`), and each React Router `typegen` script `cd`s to the repository root and
  names its project directory, as its `dev` script already did.
- `trace` and `tsconfig` stay as they are.

## Rejected alternatives

- **Keep the kit as "what both surfaces need" and rename it.** The criterion is the consumer, so every new shared module
  restarts the judgment call, and workspace-only modules keep arriving under a cross-surface banner.
- **One front-end package — `@kobato/ui` absorbs the kit.** The notifications drawer calls procedures; `@kobato/ui`
  would import `@kobato/api` and stop being a design system.
- **Move the kit's shared modules into `@kobato/api`.** Only hooks with no UI dependency qualify (§3); the rest would
  make the contract package depend on a design system and message catalogs.
- **Leave the workspace in `apps/kobato`.** Keeps one dev process and today's build, at exactly the price this ADR
  removes: an `apps/kobato` that is 94% front-end source, a build of two Vite projects writing one `build/` directory,
  and a boot sequence in the app. The second dev process is the accepted cost.
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
- Paths pinned in tools move with the workspace: the SEA asset collection, which had pinned `apps/kobato/build/client`
  and now reads the workspace's build through `@kobato/web-admin`. Three stale pins are corrected on the way —
  `components.json` (`tailwind.css`, the sheet the shadcn CLI reads), `oxfmt.config.ts` (`sortTailwindcss.stylesheet`,
  the sheet oxfmt resolves the theme from to sort classes), and `.vscode/settings.json`
  (`tailwindCSS.experimental.configFile`) — named `apps/kobato/src/styles/public.css`, which has lived in sayaka since
  ADR-0009; each now names `packages/web/ui/src/styles/ui.css`, the design system's compilation entry — it carries
  `@import 'tailwindcss'` over the token partial and scans the shadcn components, so all three consumers resolve the
  same theme. The kobato build no longer produces a client tree.
- Tests move with the source they mirror: 247 files to `packages/web/admin/tests` — 242 test files and the five helpers
  beside them — with zero `@/` or `@tests/` imports left; the `admin-arch`, `admin-unit`, `admin-snaps`, and
  `admin-tz-unit` projects take the workspace's tests, in place of the `app-*` projects that had covered them; the
  workspace arch pins sit beside them and cross-package pins stay in `apps/kobato/tests/arch`; `inkling-demo` drops the
  kit. `web-direction` changes its scan root to `packages/web/admin/src/ui`; sayaka's `frozen-admin-set` is untouched —
  it never scanned the workspace, and its roots last changed in step 2, when `packages/api/src/browser` joined. The
  workspace's test-only imports of `@kobato/server` and `@kobato/db` are five files (four tests and the unit setup),
  kept as the documented test-only exception (`packages/web/admin/AGENTS.md`): the package declares both as test
  dependencies and its `src/` imports neither.
- The workspace's `@/` imports (946 in source, 480 in tests) switch to its package specifier; `@/` remains the alias of
  `apps/kobato`'s own source.
- The shared merge rewrites the path table from eight leaves to four (sixteen rows to eight), 584 import lines, and
  every documentation mention of the five directories.
- The app e2e and browser trees import `@kobato/test/instance/*` and `@kobato/test/browser/*`; `tools/test` gains the
  driver's dependencies (`@duckdb/node-api`, `bcryptjs`, `@playwright/test`, `@kobato/base`, `@kobato/settings`) and the
  `split:smoke` script, `tools/pack` drops them and declares `@tailwindcss/vite` for the factory (neither front-end
  package declares it: each imports the factory, not the plugin); `@kobato/font-split`'s path-table rows follow its
  directory, and `no source tree imports @kobato/font-split` becomes a pin of its own now that "product never imports
  tools" no longer covers it.
- ADR-0009 is amended as above; the `AGENTS.md` tree follows each step (root, `apps/kobato`, `packages/web` and its
  three packages, `packages/shared`, `tools/`, `tools/pack`, `tools/test`, `apps/inkling-demo`).
- An external frontend author builds comments and reads notifications from the contract plus `@kobato/inkling/comment`
  and the browser data hooks, without importing `@kobato/ui` themselves.

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

## Implementation notes (2026-11-27)

The adoption landed as decided, in eight commits — step 2 in three, every other step in one. This section records what
the tree added on top of the Decision and where it refined it.

**Inkling's public API.**

- `InklingHostComposer` (`packages/inkling/src/components/InklingHostComposer.tsx`) is the host-facing composer: it
  reads locale and resolved theme from `@kobato/ui`'s `useI18n` / `useTheme` and takes `labels` as an explicit prop —
  the one place that binding lives. The barrel re-exports it from `shared-exports.ts` beside `useEditorSurface` (which
  composes `useEditorBodyReset`), `excludeBaseNodes`, `blockQuoteAsideCycle`, and `loadInklingLabels`. The workspace
  keeps only `ui/shared/use-inkling-labels.ts`, the typed reader of the shell's `labels` fact (`useDocumentLabels`).
- The comment entry registers the card decorate adapter itself. Nothing in the comment closure imports the React barrel,
  so `src/comment/CommentBodyEditor.tsx` calls `registerCardDecorateAdapter()` — the idempotent module-level call
  defined in `src/nodes/decorate-card.tsx` — and whichever entry loads first installs the adapter. The live-composer
  regression test `tests/unit/comment/CommentBodyEditor.cards.test.tsx` renders a code block through the comment entry
  alone.

**Document facts.** The chrome clock `use-chrome-clock` landed as `@kobato/ui/lib/use-document-clock`, over the shell's
document facts, beside `use-document-csrf-token` and `use-document-labels`. The settings contexts
(`@kobato/ui/lib/blog-settings-context.tsx`) gained a fonts context — `useFontsSettings` / `useFontsSettingsOptional`.
Three workspace readers that still read the root loader moved onto the shell: `AdminInstallForm` and `BackupView` onto
`useDocumentCsrfToken`, and the fonts controller (`ui/fonts/font-slots.ts`) onto `useFontsSettingsOptional`. Each app
maps its root loader data to `DocumentFacts` in its own `src/document/document-facts.ts` (`documentFactsFrom`),
unit-tested beside it (`packages/web/admin/tests/unit/document/document-facts.test.ts`,
`apps/sayaka/tests/unit/document/document-facts.test.ts`).

**Dev topology.** `honoDevHost` (`tools/pack/src/vite/hono-dev-host.ts`) is the backend's Vite SSR dev host: it loads
`apps/kobato/src/server.ts` through `@hono/vite-dev-server` and publishes the Vite dev server under the `globalThis`
slot (`Symbol.for('kobato.vite-dev-server')`) before the entry evaluates. `startKobato`'s `listener` union is
`{ mode: 'bind' }` or `{ mode: 'host'; server }` — the adopted `httpServer`, or `null` when the slot is empty. The
workspace keeps one dev-only plugin, a pre-middleware rewriting `/editor/*` → `/admin/editor/*` so Vite's `/admin/` base
lets those documents through (`packages/web/admin/vite.config.ts`). Sayaka's dev forwarding defaults to the workspace
origin (`DEV_KOBATO_RPC_URL = http://127.0.0.1:4321/rpc`, `apps/sayaka/src/server/config.ts`), so `/admin/*` and
`/rpc/*` both work through it; `SAYAKA_KOBATO_RPC_URL` still overrides.

**One listener.** `listenHono` (`packages/server/src/infra/http/listener.ts`) is the package's single
`@hono/node-server` `serve()` site — the configured host and port, `overrideGlobalObjects: false` — and both
`listenKobato` (`http/kobato-app.ts`) and the lifecycle's `restartServer` go through it, so a restart binds exactly the
options a cold boot does. `startKobato` wraps `app.fetch` with the leaked-response handler before anything binds it; a
cold production boot used to serve the unwrapped fetch until a restart.

**Route warmup.** The plugin's idle size cap (`IDLE_SIZE_LIMIT`, 100 KB in `tools/pack/src/vite/route-warmup.ts`) is
keyed on the hrefs the manifest carries. It used to key chunk sizes as `/assets/<file>`, without the base prefix, so it
never matched a workspace chunk and never applied. The manifest is `{ version, tier1, tier2 }`
(`@kobato/base/distribution/warmup-manifest`), `deriveTier2RouteIds` returns the one tier-2 list, and only sayaka mounts
the plugin (`apps/sayaka/vite.config.ts`); Vite's dev `server.warmup.clientFiles` — the root, the routes module, and
`src/routes/**` — is what the factory gives both front-ends.

**The workspace move (step 4)** landed as one commit with the route warmup removal in it: 247 files under
`packages/web/admin/tests` (242 tests and five helpers), zero `@/` or `@tests/` imports left. The three stale stylesheet
pins — `components.json` (`css`), `oxfmt.config.ts` (`sortTailwindcss.stylesheet`), `.vscode/settings.json`
(`tailwindCSS.experimental.configFile`) — now name `packages/web/ui/src/styles/ui.css`, the design system's compilation
entry.

**Tests and the backend packages.** `@kobato/web-admin`'s test tree imports `@kobato/server` and `@kobato/db`
tests-only, in five files: `tests/utils/setup/unit.ts` (it resets the analytics query executor through
`@kobato/db/duckdb/query`) and four unit tests — one pins `toClientActionResult` against the server's `authFlowMessage`,
two replay `mergeSectionPatch` behind the mocked settings commit, and one resolves mirror-preset label keys through
`createServerTranslator`. It is the documented exception (`packages/web/admin/AGENTS.md`): both are declared test
dependencies, `tests/arch/route-server-surface.test.ts` pins that `src/` imports no `@kobato/server` module, and the
package's src targets in `package-dag.test.ts` exclude both.

**The front-end config factory (`tools/pack/src/vite/front-end-config.ts`).**
`frontEndConfig({ appDir, port, identityDir?, base?, plugins?, server?, optimizeDeps?, serverEntry?, ssrExternals? })`
returns the config function; `plugins` is `{ leading, trailing }` around the shared plugin list, `base` is a function of
the config env, `optimizeDeps` adds `appOptimizeDeps(appDir)`, `serverEntry` adds the SSR environment build on `build`,
and `ssrExternals` is the build-only `ssr.external`. `identityDir` defaults to `apps/kobato` (`readAppPackage`), so the
workspace's `__APP_*__` identity still comes from the backend's manifest; sayaka passes its own.

**Pins.** The directory-level DAG pin covers `base/src` and `base/tests` — both trees must hold the five directories:
`auth` and `utils` reach only `@kobato/i18n`, and `assets`, `distribution`, and `sanitize` reach no workspace package.
The instance-driver pin is scoped to the `@kobato/base/utils` sub-tree; `@kobato/base` as a whole is not admitted.
`packages/api/src/browser` is a pinned root of sayaka's `frozen-admin-set` (beside `apps/sayaka/src` and the kit), of
`web-direction` (the `@kobato/catalog/seo` and `useRouteLoaderData` bans), and of `ui-i18n-literals`.

**The kit's final size.** 10 source files and 957 lines, plus `styles/kit.css`. Sayaka imports three of its modules in
four import lines: `use-logout`, `LazyNotificationsDrawer` (two lines), and `NotificationBadge`.

**Output paths.** The workspace's production bundle guard (`apps/kobato/tests/arch/production-rum-bundle.test.ts`) scans
`packages/web/admin/build/client` and `apps/kobato/build/server`, located from the repository root like every arch test;
the Playwright config (`tools/test/playwright.config.ts`) resolves its report and results directories from `REPO_ROOT`
into `apps/<app>/tmp/`; and both React Router `typegen` scripts `cd` to the repository root and name their project
directory.
