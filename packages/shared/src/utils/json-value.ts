/**
 * Recursive plain-JSON value, the compile-time bound for JSON-only stores:
 * dates, bigints, Maps/Sets, class instances, and `undefined` are rejected.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
