/**
 * Single-source `unsafeCast` for the codebase — keeps the
 * `oxlint-disable` count at 1. Each call site documents WHY the cast
 * is safe.
 */

export function unsafeCast<T>(value: unknown): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as unknown as T
}
