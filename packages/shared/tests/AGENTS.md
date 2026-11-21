# Shared test conventions

`packages/shared/tests/` is a plain coordination directory, not a workspace package. It holds only the umbrella Vitest configs and setup wrappers; every test file lives in its owning leaf.

- `tests/unit/vitest.config.ts` (`shared-unit`) and `tests/snaps/vitest.config.ts` (`shared-snaps`) anchor at the repository root and include the twelve shared leaves' matching test trees.
- Run all shared-leaf tests with `pnpm test packages/shared`; filters resolve against the repository root.
- Leaf suites mirror their `src/` trees under `tests/unit/` and `tests/snaps/`.
- Generic infrastructure comes from `@kobato/test`; canonical shared fixtures live in their owner leaf's `tests/utils/`.
