/**
 * Recursive plain-JSON value — the compile-time bound for stores that
 * only accept JSON-safe payloads (the kv-cache, superjson's
 * replacement). Dates, bigints, Maps/Sets, class instances, and
 * `undefined` structurally can't be assigned here.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
