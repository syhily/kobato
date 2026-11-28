# Tools umbrella conventions

`tools/` holds the development-support workspace packages (`tools/<name>` ↔ `@kobato/<specifier>`). Nothing here ships
in the product (ADR-0011 §7): the one package that used to live here and does ship, `@kobato/font-split`, is a product
package under `packages/font-split`.

- `tsconfig` — configuration-only: `tsconfig.base.json`, the single workspace path table every package extends.
- `test` — everything an in-process test needs: Vitest fixtures/doubles, shared setup, the multi-package project
  definitions, `repo-root`, the Vitest base. PRODUCT-FREE: it depends on no product package and no other tools package.
- `instance` — everything that runs out of process: the live-instance driver (`src/*.ts` + `client/`), the process
  primitives (`src/process.ts`), and the shared Playwright journey support (`src/browser/`) with `playwright.config.ts`;
  it depends on `@kobato/test` and may reach `@kobato/settings` and `@kobato/base/utils` to stage and drive a booted
  instance.
- `pack` — build and release tooling: the SEA pipeline, the binary-suite entry scripts, the build-time Vite plugins and
  the front-end config factory (`src/vite/`), release automation.
- `trace` — OpenObserve DEV container tooling.

## Boundary rules

- **Product src never depends on tools** — not even type-only (`apps/kobato/tests/arch/package-dag.test.ts`). Tools may
  depend on product packages (`instance` reaches `@kobato/settings` and `@kobato/base/utils` for the driver; `pack` and
  `trace` reach the shared leaves), never the reverse.
- **No cycle of any kind** in the workspace dependency graph — `dependencies`, `devDependencies`, and
  `optionalDependencies` edges together (`apps/kobato/tests/arch/package-dag.test.ts` builds the graph from every
  workspace `package.json` and fails with the cycle printed; pnpm's install stays warning-free). Every cycle is
  solvable: the one that used to exist (`@kobato/settings` ⇄ `@kobato/test`) was dissolved by moving the
  product-reaching driver into `@kobato/instance`.
- `pack` → `instance` → `test` is the only direction between the three tooling packages: `pack`'s suite entry scripts
  compose the instance driver, `instance` takes `repo-root` and the Vitest base from `test`, and nothing under `test`
  imports `@kobato/instance` or `@kobato/pack` (pinned by the same test). `@kobato/test` imports no `@kobato/*` product
  package, which is what lets every shared leaf dev-depend on it for its tests.
- Product **tests** import tools freely (`@kobato/test` for the in-process helpers, `@kobato/instance/client` for the
  live-instance clients), declared in each package's devDependencies.
- Build-time configs reach `pack` through its package specifier (declared by the root, `apps/kobato`, and
  `apps/sayaka`).
- Tools packages declare every import in their own package.json, self-import through `@kobato/<name>/...`, and expose
  source wildcard exports with `.ts`/`.tsx` fallback targets so packages run directly by `node` resolve without a
  bundler.
- Scripts anchor their output on the repository root — `REPO_ROOT` from `@kobato/test/repo-root`, or a project directory
  passed to a CLI after `cd`-ing to the root — never on the working directory a package script happens to run from.
