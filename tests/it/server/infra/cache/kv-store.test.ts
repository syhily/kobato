import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { KvCacheRow } from '@/server/infra/db/types'

import { clearAllTables } from '#/_helpers/integration-db'
import { getItem, getItemRaw, getItems, getKeys, removeItem, setItem, setItemRaw } from '@/server/infra/cache/kv-store'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { kvCache } from '@/server/infra/db/schema/kv-cache'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

async function findRow(key: string): Promise<KvCacheRow | null> {
  const rows = await db.select().from(kvCache).where(eq(kvCache.key, key)).limit(1)
  return rows[0] ?? null
}

const past = () => new Date(Date.now() - 60_000)
const future = () => new Date(Date.now() + 3_600_000)

describe('kv-store — JSON entries', () => {
  it('round-trips plain objects, Dates and bigints through superjson', async () => {
    const at = new Date('2026-07-01T12:00:00.000Z')
    await setItem(db, 'k:plain', { name: 'kobato', at, id: 9007199254740993n })

    const result = await getItem<{ name: string; at: Date; id: bigint }>(db, 'k:plain')
    expect(result?.name).toBe('kobato')
    expect(result?.at).toEqual(at)
    expect(result?.at instanceof Date).toBe(true)
    expect(result?.id).toBe(9007199254740993n)
  })

  it('returns null for missing keys', async () => {
    expect(await getItem(db, 'k:missing')).toBeNull()
  })

  it('stores no expiry when ttlSeconds is omitted, and the entry stays live', async () => {
    await setItem(db, 'k:immortal', 'value')
    expect((await findRow('k:immortal'))?.expiresAt).toBeNull()
    expect(await getItem(db, 'k:immortal')).toBe('value')
  })

  it('stores an expiry in the future when ttlSeconds is given', async () => {
    const before = Date.now()
    await setItem(db, 'k:ttl', 'value', { ttlSeconds: 120 })

    const row = await findRow('k:ttl')
    expect(row?.expiresAt).not.toBeNull()
    expect(row!.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 120_000)
    expect(await getItem(db, 'k:ttl')).toBe('value')
  })

  it('treats expired rows as misses on every read path', async () => {
    await db.insert(kvCache).values({ key: 'k:expired', bucket: 'misc', value: { json: 'stale' }, expiresAt: past() })

    expect(await getItem(db, 'k:expired')).toBeNull()
    expect(await getItemRaw(db, 'k:expired')).toBeNull()
    expect(await getItems(db, ['k:expired'])).toEqual([{ key: 'k:expired', value: null }])
    expect(await getKeys(db, 'k:')).toEqual([])
  })

  it('defaults the bucket to misc and honours a caller-provided bucket', async () => {
    await setItem(db, 'k:default-bucket', 'a')
    await setItem(db, 'k:og', 'b', { bucket: 'og' })

    expect((await findRow('k:default-bucket'))?.bucket).toBe('misc')
    expect((await findRow('k:og'))?.bucket).toBe('og')
  })

  it('overwrites an existing entry, resetting bucket, expiry and the sibling blob', async () => {
    await setItemRaw(db, 'k:swap', Buffer.from('png'), { bucket: 'og' })
    await setItem(db, 'k:swap', { meta: true })

    const row = await findRow('k:swap')
    expect(row?.bucket).toBe('misc')
    expect(row?.blob).toBeNull()
    expect(row?.expiresAt).toBeNull()
    expect(await getItemRaw(db, 'k:swap')).toBeNull()
    expect(await getItem(db, 'k:swap')).toEqual({ meta: true })
  })

  it('treats a non-superjson payload (raw scalar) as a miss', async () => {
    // Mirrors rows written by direct SQL (e.g. the search generation
    // counter) — `getItem` must not decode them.
    await db.insert(kvCache).values({ key: 'k:counter', bucket: 'misc', value: 5 })
    expect(await getItem(db, 'k:counter')).toBeNull()
  })

  it('removeItem deletes the entry', async () => {
    await setItem(db, 'k:remove', 'value')
    await removeItem(db, 'k:remove')
    expect(await findRow('k:remove')).toBeNull()
  })
})

describe('kv-store — raw entries', () => {
  it('round-trips a Buffer', async () => {
    const bytes = Buffer.concat([Buffer.from([0x89, 0x50]), Buffer.from('png-bytes')])
    await setItemRaw(db, 'k:raw', bytes, { ttlSeconds: 60 })
    expect(await getItemRaw(db, 'k:raw')).toEqual(bytes)
  })

  it('clears the sibling JSON value when a raw entry overwrites it', async () => {
    await setItem(db, 'k:swap-raw', { meta: true })
    await setItemRaw(db, 'k:swap-raw', Buffer.from('png'))

    const row = await findRow('k:swap-raw')
    expect(row?.value).toBeNull()
    expect(await getItem(db, 'k:swap-raw')).toBeNull()
    expect(await getItemRaw(db, 'k:swap-raw')).toEqual(Buffer.from('png'))
  })
})

describe('kv-store — getItems', () => {
  it('returns values in input order with nulls for missing keys', async () => {
    await setItem(db, 'k:a', 1)
    await setItem(db, 'k:b', 2)

    const result = await getItems<number>(db, ['k:b', 'k:missing', 'k:a'])
    expect(result).toEqual([
      { key: 'k:b', value: 2 },
      { key: 'k:missing', value: null },
      { key: 'k:a', value: 1 },
    ])
  })

  it('returns an empty result for an empty key list', async () => {
    expect(await getItems(db, [])).toEqual([])
  })
})

describe('kv-store — getKeys', () => {
  it('filters by prefix and returns keys ordered', async () => {
    await setItem(db, 'feed:xml:all', 'a')
    await setItem(db, 'feed:xml:post', 'b')
    await setItem(db, 'image-meta:x', 'c')

    expect(await getKeys(db, 'feed:')).toEqual(['feed:xml:all', 'feed:xml:post'])
  })

  it('returns every live key when no prefix is given', async () => {
    await setItem(db, 'a', 1)
    await setItem(db, 'b', 2)
    expect(await getKeys(db)).toEqual(['a', 'b'])
  })

  it('honours maxCount', async () => {
    await setItem(db, 'k:1', 1)
    await setItem(db, 'k:2', 2)
    await setItem(db, 'k:3', 3)
    expect(await getKeys(db, 'k:', 2)).toHaveLength(2)
  })

  it('escapes LIKE wildcards in the prefix', async () => {
    await setItem(db, 'a%b', 1)
    await setItem(db, 'axb', 2)

    expect(await getKeys(db, 'a%')).toEqual(['a%b'])
  })
})
