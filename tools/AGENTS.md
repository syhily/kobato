# Tools umbrella conventions

`tools/` is the top-level umbrella for development-support workspace packages — nothing under it ships in the product (no SEA bundle, no client/server graph, no runtime import from the deployed binary). Each directory is a workspace package (`tools/<name>` ↔ `@kobato/<specifier>`):

- `toolchain` — the shared TypeScript configuration (`tsconfig.base.json`, the single workspace path table) plus the app's build-time Vite plugins (`src/vite/`).
- `test` — in-process Vitest fixtures/doubles only.
- `harness` — the out-of-process instance harness.
- `trace` — OpenObserve DEV container tooling.
- `browser` — the real-browser Playwright journey runner (`test:browser` / `sea:browser`) and the Playwright config itself.
- `email` — localized email-template previews (`emails:generate`).
- `i18n` — regional terminology diff report (`i18n:regional-diff`).
- `pack` — packaging tooling: the SEA pipeline and release automation.

## Boundary rules

- **Product src never depends on tools.** No `src/` module under `apps/*` or `packages/*` may import a tools package — not even type-only. Tools may depend on product packages (`test` and `pack` do), never the reverse. Pinned by `apps/kobato/tests/arch/package-dag.test.ts`.
- Product **tests** import tools freely (`@kobato/test`, `@kobato/harness`) — the sanctioned seam, declared in each package's devDependencies.
- Build-time configs reach `pack` through its package specifier; the root and `apps/kobato` package.json files both declare the workspace link.
- Tools packages declare every import in their own package.json. Tool source and tests use `@kobato/<name>/...` self-imports (self-link declared) and `@kobato/<name>/tests/...` for helpers. Packages invoked directly by `node` expose `"./*": "./src/*"` so package self-resolution works without a bundler.
- `scripts/` (outside this umbrella) stays shell/node-builtin-only; anything needing project modules belongs here instead.
