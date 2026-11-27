# Tools umbrella conventions

`tools/` holds the development-support workspace packages (`tools/<name>` ↔ `@kobato/<specifier>`). Nothing here ships
in the product; `font-split` is the ONE exception.

- `tsconfig` — configuration-only: `tsconfig.base.json`, the single workspace path table every package extends.
- `test` — in-process Vitest fixtures/doubles, shared setup, and the multi-package project definitions.
- `pack` — build and release tooling: the SEA pipeline, the binary-suite entry scripts, the app's build-time Vite
  plugins (`src/vite/`), the out-of-process instance driver (`src/instance/`), the shared Playwright journey support
  (`src/browser/`), release automation.
- `trace` — OpenObserve DEV container tooling.
- `font-split` — a vendored cn-font-split Rust fork compiled into a Node-API addon the production server loads at
  runtime, reached only through `nativeRequire('@kobato/font-split/font-split.node')` (a specifier string, not an
  import). The workspace link sits in the ROOT `package.json` with the other production natives. The crate is the addon
  only; its local-only tooling (the corpus pipeline, the CJK table generator, the benchmark toolchain behind
  `pnpm run bench:font-split`) is TypeScript under `scripts/`, imported through the `@kobato/font-split/scripts/*`
  export.

## Boundary rules

- **Product src never depends on tools** — not even type-only. Tools may depend on product packages (`test` and `pack`
  do), never the reverse (`apps/kobato/tests/arch/package-dag.test.ts`).
- Product **tests** import tools freely (`@kobato/test`, the live-instance clients under
  `@kobato/pack/instance/client`), declared in each package's devDependencies.
- Build-time configs reach `pack` through its package specifier (declared by the root, `apps/kobato`, `apps/sayaka`, and
  `packages/web/admin`).
- Tools packages declare every import in their own package.json, self-import through `@kobato/<name>/...`, and expose
  source wildcard exports with `.ts`/`.tsx` fallback targets so packages run directly by `node` resolve without a
  bundler.
