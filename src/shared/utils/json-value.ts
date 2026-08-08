/**
 * Recursive plain-JSON value — the compile-time bound for stores that
 * only accept JSON-safe payloads. Dates, bigints, Maps/Sets, class
 * instances, and `undefined` can't be assigned here.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
