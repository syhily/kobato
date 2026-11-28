# ADR-0012: Five roots by who may import them — `sdks/`, `shared/`, `packages/` — and the workspace back in `apps/kobato`

- Status: accepted 2026-11-28 — adoption in progress (see Adoption; each step lands as its own commit). It amends
  [ADR-0011](0011-package-topology.md): §1 (the three front-end packages and the rule separating `@kobato/ui` from the
  kit), §4 (the workspace as a `packages/web/admin` project), the `packages/web/` umbrella, and §6's location
  (`packages/shared/*`) are superseded here. §2's principle stands with a new location (§4 below); §3, §5, and §7 stand.
- Date: 2026-11-28
- Related: [ADR-0009](0009-optional-headless-frontends.md) (the two deliverables and the one contract),
  [ADR-0011](0011-package-topology.md), [CONTEXT.md](../../CONTEXT.md) (`kobato`, `workspace`, `sayaka`, `Headless`).

## Context

ADR-0011 sorted the front-end packages by what they may import. Measured on the tree it left, four symptoms remain, and
one of its own numbers was misread.

- **The workspace package has one consumer.** `@kobato/web-admin` — 44,049 source lines and 242 tests — is imported by
  exactly one package: `apps/kobato`, which since ADR-0011 §4 is a 37-line entry that calls `startKobato` and locates
  the workspace build by resolving the package by name. A package that is not deployed on its own and whose only
  importer is the app that serves it is that app. The split bought a separate Vite project at the price of a resolution
  seam — `createRequire` on a package name, `adminClientBuildDir()`, and the package's own specifier for every intra-app
  import — between two directories that only ever ship together.
- **Two tiers of one thing.** `@kobato/ui` and `@kobato/web-kit` are both front-end code shared by sayaka and the
  workspace, told apart by one rule (the design system imports no `@kobato/api` module). The rule holds, but every new
  shared module still starts with the judgment call, and sayaka reaches the kit for three modules in four import lines.
- **The public surface is spread over three roots, none of them marked.** An author building a front-end for kobato
  (ADR-0009) needs the contract and its client (`packages/api`), the comment composer (`packages/inkling/src/comment`,
  reachable only through the editor's private alias), and the layer that stands in front of kobato
  (`apps/sayaka/src/server/forward.ts`, `rum-intake.ts`, `webmention-receive.ts` — inside an app, configured through
  `SAYAKA_*`). No tree says which of its packages are theirs.
- **"What may I import" has no one answer.** `packages/` holds the freely importable floor — `packages/shared/*`, the
  most-imported code in the repository — beside strictly layered private code (`server`, `db`). The directory a package
  sits in tells a reader nothing about who may reach it.
- **The comment composer's chunk is the editor.** Measured at `ad8eec4b5`, before ADR-0011: the lazy chunk holding the
  composer is 970,122 B raw (303,165 B gzip); after ADR-0011 it is about 955 KB. Lexical is 386 KB of it (40%) and
  Inkling's components, nodes, and plugins 437 KB (45%) — the composer reaches the editor through the barrel (before) or
  through the full card table (after), and carries `yjs` (66 KB) for a collaboration feature a comment never enables.
  CodeMirror, KaTeX, dnd-kit, and Pintura are already 0 B in the closure: they sit behind dynamic imports. The lean
  comment editor that exists is a node set, not a bundle.

## Decision

### 1. Five roots, by who may import what

| Root        | Holds                                                                                | May import                                                                | Who may import it                                               |
| ----------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/`     | the deployables `kobato` and `sayaka`, and the playground `inkling-demo`             | anything below                                                            | nothing imports an app                                          |
| `sdks/`     | the public surface, to be published: `api`, `ui`, `inkling`, `comments`, `perimeter` | `shared/*` and the sdk packages below them                                | any app; a private package where the layering admits it         |
| `shared/`   | the dependency floor: `base`, `i18n`, `settings`, `catalog`                          | only each other, in one direction                                         | every module of every project                                   |
| `packages/` | private product packages, never published: `db`, `server`, `font-split`              | `shared/*`, the sdks the layering admits, and each other in one direction | only the app that mounts them (`apps/kobato`), tests, and tools |
| `tools/`    | development support: `pack`, `test`, `instance`, `trace`, `tsconfig`                 | product packages as each needs; `test` depends on none                    | tests and build configuration only                              |

Two rules carry the table. **An sdk package never imports `packages/*` or an app.** **Nothing imports `packages/*`
except the app that mounts it** — `apps/kobato` reaches `@kobato/server` — its tests, and the tools. Both are pinned by
the package DAG test, together with the rule that the workspace dependency graph is acyclic: every kind of declared edge
among workspace packages, taken together.

`tools/instance` is the live-instance half that used to sit in `tools/test` (`@kobato/test`): the out-of-process driver
that boots the kobato + sayaka pair, the Playwright journey support, and the smoke entry that composes them. That split
landed first, with the acyclic pin: `@kobato/test` is everything an in-process Vitest run needs and depends on no
product package, so a product package may depend on it; `@kobato/instance` may depend on `@kobato/settings`, and `pack`
→ `instance` → `test` is the only direction among the three.

### 2. The workspace is `apps/kobato`

`apps/kobato` (package `kobato`) is the workspace and the backend in one app: a React Router 8 **SPA** project —
`react-router.config.ts`, `vite.config.ts`, `src/root.tsx`, `src/routes.ts`, `src/routes/`, `src/ui/`, `src/lib/`,
`src/document/`, `src/seo/`, `src/styles/` — beside the backend entry ADR-0011 §5 left in place (`src/server.ts`, which
calls `startKobato`, and `src/server/`). The boot sequence stays in `@kobato/server`; `@kobato/web-admin` is gone. The
workspace imports its own source as `@/...` and its test helpers as `@tests/...`, the app aliases of the root import
conventions.

- **The client tree stays browser-safe.** `src/ui`, `src/routes`, and the rest of the SPA import no `@kobato/server` and
  no `@kobato/db` module; `src/server.ts` and `src/server/*` are the package's only server-side modules. The pin moves
  with the tree.
- **Two Vite projects, two outputs.** The workspace builds `build/workspace/client` (the static tree under the `/admin/`
  base) and its prerender-only `build/workspace/server`; the backend bundle stays `build/server/index.js`
  (`vite.backend.config.ts`, which is also the backend's dev host). Neither build writes into the other's directory.
- **The build output is found beside the bundle.** `clientAssetsRoot()` resolves `build/workspace/client` relative to
  `import.meta.url` — from `src/server/` in dev and from `build/server/` in the bundle — never through the working
  directory and never through a package name. The SEA asset collection reads the same directory from the repository
  root.
- **Three dev commands, unchanged.** `pnpm dev` is the backend (4320), `pnpm dev:admin` the workspace (4321, proxying
  `/rpc`, `/health`, `/ready` to the backend), `pnpm dev:public` sayaka (4322).

### 3. `@kobato/ui` is the shared front-end library

`sdks/ui` (`@kobato/ui`) absorbs `@kobato/web-kit`: the design system, the document shell, and the front-end features
that call the contract — the notifications family, `use-logout`, `toast-api-error`. One rule replaces ADR-0011 §1's two:
**`@kobato/ui` is what both front-ends share. It imports `@kobato/api`, the shared leaves, and React Router where a
feature needs it; it never imports an app or the workspace.** ADR-0011 §3 stands unchanged — a procedure-calling hook
that imports no UI package is the contract's own, under `@kobato/api/browser`. `@kobato/web-kit` is gone and every
`@kobato/web-kit/<path>` import becomes `@kobato/ui/<path>`.

### 4. `@kobato/comments` is the public comment surface, and it is lean

The comment surface leaves Inkling for `sdks/comments` (`@kobato/comments`): `CommentBodyEditor`,
`LazyCommentBodyEditor`, `CommentContentHtml`, `comment-body-helpers`, `viewport-zoom-lock`, and the editor helpers —
the trimmed node set, the transformers filtered to it, the legacy-math downgrade. ADR-0011 §2's principle is unchanged
(the composer sits beside the comment model it composes); its location follows §1 — a public package may not depend on a
private alias. It imports Inkling only through **public lean entries** — never the barrel, never
`@kobato/inkling-internal/*`: the host composer and the surface, the editor-platform hooks, the base node set without
cards, the base transformers, and the code-block node with its card. Each entry is a deliberate module documented in
Inkling's `AGENTS.md`; the barrel stays the full editor's.

**The closure rule.** The comment composer's lazy closure contains no card component but the code block's plain editor,
no card menu or picker, no collaboration runtime, and none of CodeMirror, KaTeX, dnd-kit, or Pintura. A bundle test
holds it, and the chunk size is recorded under Implementation notes.

### 5. `@kobato/perimeter` is the Hono layer in front of kobato

The pieces of sayaka's Hono perimeter that every front-end needs leave the app for `sdks/perimeter`
(`@kobato/perimeter`): forwarding of `/rpc`, `/admin`, and `/editor` to kobato (streamed bodies, hop-by-hop headers
stripped both ways, spoofable proxy headers dropped and re-derived, the bounded upstream fetch, 502 and 504), the two
inbound protocol relays (RUM intake, Webmention receive), the trusted-proxy visitor address, and the scheme fix. The
package takes its facts as options — kobato's origin, the request timeout, the trusted proxies — and never reads an
environment variable. Sayaka maps `SAYAKA_*` into those options and composes them in `configurePerimeter`; what stays in
sayaka is its own: the document pipeline (request context, cookie relay, CSP and document headers, resource unwrapping),
its URL policy (trailing slash, the WordPress decoy, the site files), the vendored Hono glue, lifecycle, logging,
configuration, and the SEA seams.

### 6. Icons are SVG files

No icon is defined in code. An icon is an `.svg` file imported as a component through `vite-plugin-svgr`'s `?react`
suffix — the mechanism the repository already uses. `createIcon` goes; the brand icons in `@kobato/ui` and the metric
brand icons in the workspace become `.svg` files under an `icons/` directory, imported where they are rendered.

### 7. `inkling-demo` is a React Router SPA

`apps/inkling-demo` becomes a React Router 8 **SPA** project like the workspace — `react-router.config.ts`,
`vite.config.ts` over the front-end config factory, `src/root.tsx`, one route rendering the playground — so its build
output is `build/client`, as for every app, instead of Vite's default `dist`.

## Rejected alternatives

- **Keep the workspace a package.** It has one consumer and is not deployed alone; the seam it needs to be found through
  is the whole cost.
- **Keep `ui` and the kit apart by import rule.** Two tiers of one thing; the rule answered "may it call a procedure",
  which the merged package states once.
- **Put the public packages under `packages/` (`packages/sdk/*`).** Then "a package under `packages/` is private" is
  false at its first exception.
- **Leave `shared/` under `packages/`.** The floor is the most-imported code in the repository; leaving it in the
  private root keeps the private rule untrue where it matters most.
- **Keep the comment surface inside Inkling.** An external author composes a comment with the contract and one public
  package; inside the editor it is reachable only through the private alias and drags the card table along.
- **Leave Inkling a private package.** `@kobato/comments` builds on it; a public package may not depend on a private
  one, and the page editor is the editor library every front-end's author extends.
- **Extract all of sayaka's server tree.** The document pipeline is sayaka's framework glue; only the kobato-facing
  pieces are everyone's.
- **Keep icons as code.** A path table in a `.tsx` module against a plain `.svg` file the toolchain types, HMRs, and
  lets a design tool own.
- **Give the demo a Vite library-style `dist`.** A third build layout for one app; the SPA project is the layout the
  other two apps already have.

## Consequences

- The path table loses `@kobato/web-admin`, `@kobato/web-kit`, and their test rows, and gains `@kobato/comments` and
  `@kobato/perimeter` (`@kobato/instance` landed with the tools split); every `@kobato/web-kit/<path>` import becomes
  `@kobato/ui/<path>` and every `@kobato/inkling/comment/<path>` becomes `@kobato/comments/<path>`.
- The workspace's arch pins rejoin `apps/kobato/tests/arch`; its unit and snapshot trees rejoin the kobato app's test
  projects; the coverage configuration excludes the workspace UI tree again, as before ADR-0011 §4.
- Sayaka's unit tests for the moved perimeter modules move with them; its `stub-kobato` harness follows the modules that
  drive the real client transport over a stubbed `fetch`, reached through the sanctioned test seam.
- Dev is still three commands and production is still one binary: `pnpm run build` builds the workspace (`apps/kobato` →
  `build/workspace/client`), then the backend bundle, then sayaka.
- `packages/` is three packages and `packages/web/` is gone; the `AGENTS.md` tree follows each step.

## Adoption

Each step is green on its own — `pnpm run fmt`, `pnpm run lint`, `pnpm test`, `pnpm run build`; the steps that move a
build output or a boot path add `pnpm run split:smoke`.

1. **The workspace moves home** to `apps/kobato`, with the two Vite projects' outputs separated.
2. **`shared/` lifts** to a top-level root.
3. **`sdks/` opens** with `api`, `inkling`, and `ui` (which absorbs the kit).
4. **`comments`** leaves Inkling for `sdks/comments` over the lean entries, and the closure rule is pinned.
5. **`perimeter`** leaves sayaka for `sdks/perimeter`.
6. **Icons become SVG files.**
7. **`inkling-demo` becomes a React Router SPA.**
