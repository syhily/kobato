/**
 * Recursively convert `Date`s to epoch-ms so a payload survives
 * `JSON.stringify` without a reviver. Plain objects/arrays are walked;
 * class instances (Buffer, Map, …) are NOT supported by design.
 */
export function toJsonSafe(value: unknown): unknown {
  if (value instanceof Date) {
    return value.getTime()
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe)
  }
  if (value !== null && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJsonSafe(entry)]))
  }
  return value
}
