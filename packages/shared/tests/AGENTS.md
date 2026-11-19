# Shared test conventions

`packages/shared/` is an umbrella of 12 leaf packages (`utils`, `i18n`, `cache`, `auth`, `catalog`, `settings`, `assets`, `sanitize`, `contracts`, `telemetry`, `distribution`, `seo`); this directory is the `@kobato/shared-tests` workspace package holding the umbrella vitest roots, their product-coupled setup wrapper, and the shared fixture copies the roots need — not tests of its own (the `@kobato/web-tests` mirror).

- **`tests/unit/vitest.config.ts`** (`shared-unit`) — anchors at the REPOSITORY ROOT and includes `packages/shared/{utils,i18n,cache,auth,catalog,settings,assets,sanitize,contracts,telemetry,distribution,seo}/tests/unit/**/*.test.{ts,tsx}`.
- **`tests/snaps/vitest.config.ts`** (`shared-snaps`) — the same include over the leaves' `tests/snaps/**` (currently only `seo`).
- Run with `npx vitest run --project shared-unit` / `--project shared-snaps`; filters resolve against the REPO ROOT (e.g. `npx vitest run --project shared-unit contracts/`).
- Each leaf's suites live in its own `tests/` tree and mirror its `src/` (unit → `tests/unit/<mirrored-path>.test.ts`, snapshots → `tests/snaps/`).
- Generic test infrastructure comes from `@kobato/test`; product-shaped fixtures live in each leaf's `tests/utils/` and the umbrella setup wrapper lives here in `utils/setup/`.
