/**
 * Single-source `unsafeCast` for the codebase — keeps the
 * `oxlint-disable` count at 2. Each call site documents WHY the cast
 * is safe.
 */

// The return-only type parameter IS the API: callers write `unsafeCast<Foo>(x)`
// instead of a per-site `as Foo` assertion.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function unsafeCast<T>(value: unknown): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as unknown as T
}
