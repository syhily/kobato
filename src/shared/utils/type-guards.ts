/**
 * Narrow `unknown` to `Record<string, unknown>` — safe replacement for
 * a bare cast when the value comes from third-party `any`.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
