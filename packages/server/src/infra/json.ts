export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

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
