import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const store = new Map<string, unknown>()

const getItem = vi.fn(async (_db: unknown, key: string) => store.get(key) ?? null)
const setItem = vi.fn(async (_db: unknown, key: string, value: unknown, _opts?: unknown) => {
  store.set(key, value)
})
const removeItem = vi.fn(async (_db: unknown, key: string) => {
  store.delete(key)
})

vi.mock('@/server/infra/cache/kv-store', () => ({
  getItem: (db: unknown, key: string) => getItem(db, key),
  setItem: (db: unknown, key: string, value: unknown, opts?: unknown) => setItem(db, key, value, opts),
  removeItem: (db: unknown, key: string) => removeItem(db, key),
}))

import { createKvCache } from '@/server/infra/cache/kv-cache'

// The db handle is only forwarded to the mocked kv-store — a stand-in is
// enough for the unit scope.
const db = {} as NodePgDatabase

describe('createKvCache', () => {
  beforeEach(() => {
    store.clear()
    vi.clearAllMocks()
  })

  it('returns the stored value when present', async () => {
    const cache = createKvCache<{ name: string }>('test:plain', { ttlMs: 60_000 })
    await cache.set(db, { name: 'kobato' })
    expect(await cache.get(db)).toEqual({ name: 'kobato' })
  })

  it('returns null for cache misses', async () => {
    const cache = createKvCache<unknown>('test:miss', { ttlMs: 60_000 })
    expect(await cache.get(db)).toBeNull()
  })

  it('treats an unreadable entry as a miss without an extra delete', async () => {
    // kv-store already maps undeserializable rows to null; the cache must
    // not attempt an eager evict it cannot distinguish from a plain miss.
    const cache = createKvCache<unknown>('test:corrupt', { ttlMs: 60_000 })
    expect(await cache.get(db)).toBeNull()
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('returns the validated data when the schema matches', async () => {
    const cache = createKvCache<{ name: string }>('test:schema', {
      ttlMs: 60_000,
      schema: z.object({ name: z.string() }),
    })
    store.set('test:schema', { name: 'kobato' })
    expect(await cache.get(db)).toEqual({ name: 'kobato' })
  })

  it('evicts on schema mismatch and treats the entry as a miss', async () => {
    const cache = createKvCache<{ name: string }>('test:stale', {
      ttlMs: 60_000,
      schema: z.object({ name: z.string() }),
    })
    store.set('test:stale', { renamed: 'field' })
    expect(await cache.get(db)).toBeNull()
    expect(removeItem).toHaveBeenCalledWith(db, 'test:stale')
  })

  it('converts ttlMs to whole seconds on set', async () => {
    const cache = createKvCache<string>('test:ttl', { ttlMs: 60_000 })
    await cache.set(db, 'value')
    expect(setItem).toHaveBeenCalledWith(db, 'test:ttl', 'value', { ttlSeconds: 60 })
  })

  it('rounds sub-second TTLs up to one second', async () => {
    const cache = createKvCache<string>('test:ttl-floor', { ttlMs: 500 })
    await cache.set(db, 'value')
    expect(setItem).toHaveBeenCalledWith(db, 'test:ttl-floor', 'value', { ttlSeconds: 1 })
  })

  it('clears entries', async () => {
    const cache = createKvCache<string>('test:clear', { ttlMs: 60_000 })
    await cache.set(db, 'value')
    expect(await cache.get(db)).toBe('value')
    await cache.clear(db)
    expect(await cache.get(db)).toBeNull()
    expect(removeItem).toHaveBeenCalledWith(db, 'test:clear')
  })
})
