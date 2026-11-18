# Tools umbrella conventions

`tools/` is the top-level umbrella for development-support workspace packages — nothing under it ships in the product (no SEA bundle, no client/server graph, no runtime import from the deployed binary). Each directory is a workspace package (`tools/<name>` ↔ `@kobato/<specifier>`):

- `toolchain` ↔ `@kobato/toolchain` — the shared TypeScript (`tsconfig.base.json`) / oxlint / oxfmt configuration, consumed by the root config wrappers and `tsconfig.json` via its exports map.
- `test` ↔ `@kobato/test` — in-process Vitest fixtures/doubles only (see `test/AGENTS.md`).
- `harness` ↔ `@kobato/harness` — the out-of-process instance harness (see `harness/AGENTS.md`).
- `trace` ↔ `@kobato/trace` — OpenObserve DEV container tooling (see `trace/README.md`).
- `browser` ↔ `@kobato/browser` — the real-browser Playwright journey runner (`test:browser` / `sea:browser`).
- `email` ↔ `@kobato/email` — localized email-template previews (`emails:generate`).
- `i18n` ↔ `@kobato/i18n-tools` — regional terminology diff report (`i18n:regional-diff`).
- `pack` ↔ `@kobato/pack` — packaging tooling: the SEA pipeline (`pack/src/sea/`, own AGENTS.md) and release automation (`pack/src/release.ts`).

## Boundary rules

- **Product src never depends on tools.** No `src/` module under `apps/*` or `packages/*` may import a tools package — not even type-only. The dependency edge is strictly one-directional: tools may depend on product packages (`test` and `pack` do), never the reverse. Pinned by `apps/kobato/tests/arch/package-dag.test.ts`.
- Product **tests** import tools freely (`@kobato/test`, `@kobato/harness`); that is the sanctioned seam, declared in each package's devDependencies.
- A few build-time seams reach into `pack` by relative path (`vite.sea.config.ts`, `apps/kobato/vite.config.ts`, the SEA contract tests) — these are listed exceptions in the package-dag test, not a license for new ones.
- Tools packages declare every import in their own package.json; the workspace layering rules of the product packages still apply to what they consume.
- `scripts/` (outside this umbrella) stays shell/node-builtin-only; anything needing project modules belongs here instead.
