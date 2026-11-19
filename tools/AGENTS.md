# Tools umbrella conventions

`tools/` is the top-level umbrella for development-support workspace packages — nothing under it ships in the product (no SEA bundle, no client/server graph, no runtime import from the deployed binary). Each directory is a workspace package (`tools/<name>` ↔ `@kobato/<specifier>`):

- `toolchain` ↔ `@kobato/toolchain` — the shared TypeScript configuration (`tsconfig.base.json`, consumed by `tsconfig.json` and the app tsconfigs through its exports map) plus the app's build-time Vite plugins (`src/vite/`: the React Compiler pass and the route-warmup tierer). See `toolchain/AGENTS.md`.
- `test` ↔ `@kobato/test` — in-process Vitest fixtures/doubles only (see `test/AGENTS.md`).
- `harness` ↔ `@kobato/harness` — the out-of-process instance harness (see `harness/AGENTS.md`).
- `trace` ↔ `@kobato/trace` — OpenObserve DEV container tooling (see `trace/README.md`); it consumes `pack/sea/paths.ts` for the shared observability-asset location and `@kobato/telemetry` for protocol names.
- `browser` ↔ `@kobato/browser` — the real-browser Playwright journey runner (`test:browser` / `sea:browser`).
- `email` ↔ `@kobato/email` — localized email-template previews (`emails:generate`).
- `i18n` ↔ `@kobato/i18n-tools` — regional terminology diff report (`i18n:regional-diff`).
- `pack` ↔ `@kobato/pack` — packaging tooling: the SEA pipeline (`pack/src/sea/`, own AGENTS.md) and release automation (`pack/src/release.ts`).

## Boundary rules

- **Product src never depends on tools.** No `src/` module under `apps/*` or `packages/*` may import a tools package — not even type-only. The dependency edge is strictly one-directional: tools may depend on product packages (`test` and `pack` do), never the reverse. Pinned by `apps/kobato/tests/arch/package-dag.test.ts`.
- Product **tests** import tools freely (`@kobato/test`, `@kobato/harness`); that is the sanctioned seam, declared in each package's devDependencies.
- Build-time configs reach `pack` through its package specifier (`@kobato/pack/sea/*`): the root `package.json` and `apps/kobato/package.json` both declare the workspace link, so Node resolution works while the config loads. Product SEA contract tests use `@kobato/pack/...` the same way.
- Tools packages declare every import in their own package.json; the workspace layering rules of the product packages still apply to what they consume.
- Tool source and tests use `@kobato/<name>/...` self-imports (with the self-link declared) and `@kobato/<name>/tests/...` for test helpers. Packages invoked directly by `node` expose `"./*": "./src/*"` so package self-resolution works without a bundler. Root Vite config loading and build-output entry paths remain the sanctioned relative seams.
- `scripts/` (outside this umbrella) stays shell/node-builtin-only; anything needing project modules belongs here instead.
