# Web test conventions

`packages/web/tests/` is a plain coordination directory, not a workspace package. It holds only the umbrella Vitest configs and their product-coupled setup wrappers.

- Leaf suites live in `packages/web/{client,public,admin}/tests/{unit,snaps}` and mirror their owning `src/` trees.
- `tests/unit/vitest.config.ts` declares `web-unit` for all three leaf unit trees and `web-tz-unit` for `time-labels.test.ts`, which requires forks for its runtime `process.env.TZ` write. `tests/snaps/vitest.config.ts` declares `web-snaps`.
- Cross-leaf and cross-package contract tests live in `apps/kobato/tests/arch/` or the app's owning test tree, never here.
- Run all web-leaf tests with `pnpm test packages/web`. Filters resolve from the repository root.
- Generic infrastructure comes from `@kobato/test`. Shared fixtures and render helpers use their canonical owners' `tests/utils/`; single-consumer helpers stay in the consuming leaf.
