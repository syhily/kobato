/* oxlint-disable typescript/no-unsafe-type-assertion */
// Parse a string to BigInt, returning null on failure instead of throwing.
export function safeBigInt(value: string): bigint | null {
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

export function isNumeric(str: string): boolean {
  return /^-?\d+$/.test(str)
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string')
}

// Render a numeric/BigInt id as a plain decimal string. Drizzle types
// `bigint` columns as JS BigInts (e.g. `comment.id`, `userId`), but the
// pg int8 type-parser actually returns those values as strings — so wire
// DTOs ship strings. `idStr` accepts all three so call sites stay uniform
// whether the id arrived from the server (bigint per TS, string at
// runtime) or from a wire response (string at both levels).
export function idStr(value: bigint | number | string): string {
  return String(value)
}

function hashSeed(seed: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h1 ^ h2) >>> 0
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed)
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

// Fisher-Yates shuffle. Returns a new array; does not mutate the input.
export function shuffle<T>(items: readonly T[], seed?: string): T[] {
  const copy = items.slice()
  const random = seed === undefined ? Math.random : seededRandom(seed)
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Lodash's `_.sampleSize`: pick `n` distinct items from `items`, in random
// order. Drop-in replacement so we no longer need to ship lodash on the
// server (~70KB of duplicated functionality for two utilities).
export function sampleSize<T>(items: readonly T[], n: number, seed?: string): T[] {
  if (n <= 0 || items.length === 0) {
    return []
  }
  if (n >= items.length) {
    return shuffle(items, seed)
  }
  return shuffle(items, seed).slice(0, n)
}

// Group an array by the result of a key function. Replaces _.groupBy for the
// (currently single) call site that needed it.
export function groupBy<T, K extends string | number>(items: readonly T[], keyFn: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>
  for (const item of items) {
    const key = keyFn(item)
    ;(result[key] ??= []).push(item)
  }
  return result
}

/** Recursively clone an object and all its nested objects/arrays.
 *  No-op for primitives and null. */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(deepClone) as unknown as T
  }
  const cloned: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(obj as object)) {
    cloned[key as string] = deepClone((obj as Record<string, unknown>)[key as string])
  }
  return cloned as T
}

/** Recursively freeze an object and all its nested objects/arrays.
 *  No-op for primitives, null, or already-frozen objects. */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  if (Object.isFrozen(obj)) {
    return obj
  }
  Object.freeze(obj)
  for (const key of Reflect.ownKeys(obj)) {
    const value = (obj as Record<PropertyKey, unknown>)[key]
    if (value !== null && typeof value === 'object') {
      deepFreeze(value)
    }
  }
  return obj
}
