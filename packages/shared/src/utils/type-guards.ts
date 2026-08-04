/**
 * Narrow an `unknown` value to a `Record<string, unknown>`.
 * Safe replacement for `value as Record<string, unknown>` when the
 * value originates from third-party `any` (e.g. JSON.parse, library
 * payloads) and we want to inspect its properties type-safely.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
