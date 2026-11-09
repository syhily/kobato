/**
 * Compile-time assertion helpers shared by the `tests/inkling/typecheck/`
 * fixtures. Type-only: these modules are never executed (the fixtures are
 * type-checked by the root tsconfig, not run by Vitest).
 */
export type Expect<T extends true> = T

export type Equal<A, B> = (<T>(_: T) => T extends A ? 1 : 2) extends <T>(_: T) => T extends B ? 1 : 2 ? true : false

export type Extends<A, B> = [A] extends [B] ? true : false
