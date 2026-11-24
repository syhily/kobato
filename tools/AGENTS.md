# Tools umbrella conventions

`tools/` is the top-level umbrella for development-support workspace packages — nothing under it ships in the product
(no SEA bundle, no client/server graph, no runtime import from the deployed binary). Each directory is a workspace
package (`tools/<name>` ↔ `@kobato/<specifier>`):

- `tsconfig` — configuration-only: `tsconfig.base.json`, the single workspace path table every package extends.
- `test` — in-process Vitest fixtures/doubles, shared setup, and multi-package project definitions.
- `pack` — build and release tooling: the SEA pipeline, the binary-suite entry scripts (`sea:e2e`, `sea:browser`,
  `playwright.config.ts`), the app's build-time Vite plugins and config helpers (`src/vite/`), the out-of-process
  instance driver (`src/instance/`), and release automation.
- `trace` — OpenObserve DEV container tooling.
- `font-split` — the ONE exception to "nothing ships": a vendored cn-font-split Rust fork compiled into a Node-API addon
  the production server loads at runtime. Product src still never imports it — the server reaches the addon only through
  `nativeRequire('@kobato/font-split/font-split.node')` (a plain specifier string, not an import), so the package-dag
  boundary holds; the workspace link is declared in the ROOT `package.json` next to the other production
  native-dynamic-library dependencies. Details: `font-split/AGENTS.md`.

## Boundary rules

- **Product src never depends on tools.** No `src/` module under `apps/*` or `packages/*` may import a tools package —
  not even type-only. Tools may depend on product packages (`test` and `pack` do), never the reverse. Pinned by
  `apps/kobato/tests/arch/package-dag.test.ts`.
- Product **tests** import tools freely (`@kobato/test`, and the live-instance clients under
  `@kobato/pack/instance/client`) — the sanctioned seam, declared in each package's devDependencies.
- Build-time configs reach `pack` through its package specifier; the root and `apps/kobato` package.json files both
  declare the workspace link.
- Tools packages declare every import in their own package.json. Tool source and tests use `@kobato/<name>/...`
  self-imports (self-link declared) and `@kobato/<name>/tests/...` for helpers. Packages invoked directly by `node`
  expose source wildcard exports with `.ts`/`.tsx` fallback targets so package self-resolution works without a bundler.
- `scripts/` (outside this umbrella) stays shell/node-builtin-only; anything needing project modules belongs here
  instead.
