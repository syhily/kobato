// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function unsafeCast<T>(value: unknown): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as unknown as T
}
