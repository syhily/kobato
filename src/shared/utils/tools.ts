import { unsafeCast } from '@/shared/utils/unsafe-cast'
export function safeBigInt(value: string): number | null {
  try {
    const parsed = Number(value)
    return Number.isInteger(parsed) && Number.isFinite(parsed) ? parsed : null
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
// bigint columns as BigInt, but pg returns int8 as strings, so wire DTOs
// ship strings; `idStr` accepts all three forms.
export function idStr(value: number | string): string {
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

// Drop-in replacement for `_.sampleSize` — avoids shipping lodash.
export function sampleSize<T>(items: readonly T[], n: number, seed?: string): T[] {
  if (n <= 0 || items.length === 0) {
    return []
  }
  if (n >= items.length) {
    return shuffle(items, seed)
  }
  return shuffle(items, seed).slice(0, n)
}

export function groupBy<T, K extends string | number>(items: readonly T[], keyFn: (item: T) => K): Record<K, T[]> {
  const result = unsafeCast<Record<K, T[]>>({})
  for (const item of items) {
    const key = keyFn(item)
    ;(result[key] ??= []).push(item)
  }
  return result
}
