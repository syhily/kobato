/**
 * Single-source `unsafeCast` for the entire codebase.
 *
 * Used in places where TypeScript cannot verify structural compatibility
 * between two independent type hierarchies that are known to be isomorphic
 * at runtime (e.g. JSONB columns, Inkling↔Lexical bridge, API DTOs during
 * format migration).  Each call site documents WHY the cast is safe.
 *
 * By centralising the cast here, we keep the `oxlint-disable` count to 1
 * instead of scattering it across dozens of files.
 */

/** Structural cast between isomorphic JSON shapes.  Callers must document
 *  why the runtime shapes are compatible. */
export function unsafeCast<T>(value: unknown): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as unknown as T
}
