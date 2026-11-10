/**
 * Narrow `unknown` to `Record<string, unknown>` — prefer this to a bare cast on
 * third-party `any`.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
