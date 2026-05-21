# Test conventions

Conventions for the `tests/` directory.

## Test utilities

- Import test utilities from `vite-plus/test`, not `vitest`.

## TypeScript pragmatism

Test code is not production code — its primary goal is to verify behavior, not to
model perfect types. Inside `tests/` (including mocks, spies, and fixtures),
strict type-checking may be relaxed when it would otherwise add unreasonable
ceremony:

- `any`, `as`, and `ts-expect-error` are acceptable escapes when a mock shape,
  test double, or fixture is intentionally partial or diverges from the real
  type.
- Prefer the narrowest escape possible; reach for `any` only after `as` or a
  partial type annotation proves too verbose.

## Imports

- Relative imports are acceptable inside `tests/`. Do not enforce the `@/*`
  alias requirement that applies to `src/` code. Use whichever path keeps the
  test file readable and self-contained.
