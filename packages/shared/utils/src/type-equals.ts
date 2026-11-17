// Compile-time equality check used by the settings system's registry checks.
// The `<T>()` variance wrappers are load-bearing: inlining them would degrade
// the strict equality check to mutual assignability.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false
export type Assert<T extends true> = T
