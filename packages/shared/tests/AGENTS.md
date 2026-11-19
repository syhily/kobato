# Shared test conventions

`packages/shared/` is an umbrella of 13 leaf packages (`utils`, `i18n`, `cache`, `auth`, `catalog`, `settings`, `assets`, `lexical`, `sanitize`, `contracts`, `telemetry`, `distribution`, `seo`); this directory is the `@kobato/shared-tests` workspace package holding only the umbrella vitest roots, not tests of its own (the `@kobato/web-tests` mirror).

- **`tests/unit/vitest.config.ts`** (`shared-unit`) — anchors at the REPOSITORY ROOT and includes `packages/shared/{utils,i18n,cache,auth,catalog,settings,assets,lexical,sanitize,contracts,telemetry,distribution,seo}/tests/unit/**/*.test.{ts,tsx}`.
- **`tests/snaps/vitest.config.ts`** (`shared-snaps`) — the same include over the leaves' `tests/snaps/**` (currently only `seo`).
- Run with `npx vitest run --project shared-unit` / `--project shared-snaps`; filters resolve against the REPO ROOT (e.g. `npx vitest run --project shared-unit lexical/`).
- Each leaf's suites live in its own `tests/` tree and mirror its `src/` (unit → `tests/unit/<mirrored-path>.test.ts`, snapshots → `tests/snaps/`).
- Shared utilities come from `@kobato/test` (see `tools/test/AGENTS.md`).
