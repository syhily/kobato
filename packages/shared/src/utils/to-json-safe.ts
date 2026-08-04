/**
 * Recursively convert `Date`s to epoch-ms numbers so a payload survives
 * `JSON.stringify` without a reviver (the superjson replacement — with
 * `bigint` gone from the data model, `Date` was the only non-JSON type
 * left). Plain objects and arrays are walked; class instances
 * (Buffer, Map, …) are NOT supported by design — keep payloads plain.
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
