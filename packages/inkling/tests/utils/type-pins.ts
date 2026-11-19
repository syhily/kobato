export type Expect<T extends true> = T
export type Equal<A, B> = (<T>(_: T) => T extends A ? 1 : 2) extends <T>(_: T) => T extends B ? 1 : 2 ? true : false
export type Extends<A, B> = [A] extends [B] ? true : false
