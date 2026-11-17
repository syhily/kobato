# Shared test conventions

`packages/shared/` is an umbrella of nine leaf packages (`utils`, `i18n`, `cache`, `settings`, `assets`, `lexical`, `sanitize`, `contracts`, `seo`); this directory holds only the umbrella vitest roots, not tests of its own.

- **`tests/unit/vitest.config.ts`** (`shared-unit`) — anchors at the REPOSITORY ROOT (this directory is not a workspace package, so `@kobato/test` files are imported by relative path) and includes `packages/shared/{utils,i18n,cache,settings,assets,lexical,sanitize,contracts,seo}/tests/unit/**/*.test.{ts,tsx}`.
- **`tests/snaps/vitest.config.ts`** (`shared-snaps`) — the same include over the leaves' `tests/snaps/**` (currently only `seo`).
- Run with `npx vitest run --project shared-unit` / `--project shared-snaps`; filters resolve against the REPO ROOT (e.g. `npx vitest run --project shared-unit lexical/`).
- Each leaf's suites live in its own `tests/` tree and mirror its `src/` (unit → `tests/unit/<mirrored-path>.test.ts`, snapshots → `tests/snaps/`).
- Shared utilities come from `@kobato/test` (see `packages/tools/test/AGENTS.md`).
