# Tools umbrella conventions

`tools/` holds the development-support workspace packages (`tools/<name>` ↔ `@kobato/<specifier>`). Nothing here ships
in the product (ADR-0011 §7): the one package that used to live here and does ship, `@kobato/font-split`, is a product
package under `packages/font-split`.

- `tsconfig` — configuration-only: `tsconfig.base.json`, the single workspace path table every package extends.
- `test` — everything a test needs: in-process Vitest fixtures/doubles, shared setup, the multi-package project
  definitions, the out-of-process instance driver (`src/instance/`), the shared Playwright journey support
  (`src/browser/`) with `playwright.config.ts`.
- `pack` — build and release tooling: the SEA pipeline, the binary-suite entry scripts, the build-time Vite plugins and
  the front-end config factory (`src/vite/`), release automation.
- `trace` — OpenObserve DEV container tooling.

## Boundary rules

- **Product src never depends on tools** — not even type-only (`apps/kobato/tests/arch/package-dag.test.ts`). Tools may
  depend on product packages (`test` reaches `@kobato/settings` and `@kobato/base/utils` for the instance driver; `pack`
  and `trace` reach the shared leaves), never the reverse.
- `pack` → `test` is the only direction between the two: `pack`'s suite entry scripts compose the instance driver, and
  nothing under `test` imports `@kobato/pack` (pinned by the same test).
- Product **tests** import tools freely (`@kobato/test`, the live-instance clients under
  `@kobato/test/instance/client`), declared in each package's devDependencies. The two directions together make one
  workspace dependency cycle, dev-only and accepted: `@kobato/settings` dev-depends on `@kobato/test` for its test setup
  while `@kobato/test` dev-depends on `@kobato/settings` for `instance/seed.ts` and `instance/split-smoke.ts` — the
  `@kobato/settings` source imports no tools package, `tools/test` has no production source (the driver is the side that
  imports settings), no rule forbids it, and both packages are private; pnpm warns about it on install.
- Build-time configs reach `pack` through its package specifier (declared by the root, `apps/kobato`, `apps/sayaka`, and
  `packages/web/admin`).
- Tools packages declare every import in their own package.json, self-import through `@kobato/<name>/...`, and expose
  source wildcard exports with `.ts`/`.tsx` fallback targets so packages run directly by `node` resolve without a
  bundler.
- Scripts anchor their output on the repository root — `REPO_ROOT` from `@kobato/test/repo-root`, or a project directory
  passed to a CLI after `cd`-ing to the root — never on the working directory a package script happens to run from.
