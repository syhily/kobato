import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { KvCacheRow } from '@/server/infra/db/types'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { getItem, getItemRaw, getItems, removeItem, setItem, setItemRaw } from '@/server/infra/cache/kv-store'
import { kvCache } from '@/server/infra/db/schema/kv-cache'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function findRow(key: string): Promise<KvCacheRow | null> {
  const rows = await db.select().from(kvCache).where(eq(kvCache.key, key)).limit(1)
  return rows[0] ?? null
}

const past = () => new Date(Date.now() - 60_000)

describe('kv-store — JSON entries', () => {
  it('round-trips JSON-native values with plain-JSON semantics', async () => {
    // Bucket payloads are JSON-native by contract: a stored Date comes back as its ISO string.
    await setItem(
      db,
      'k:plain',
      { name: 'kobato', atMs: 1782907200000, tags: ['a', 'b'], pinned: false },
      { bucket: 'feed' },
    )

    const result = await getItem<{ name: string; atMs: number; tags: string[]; pinned: boolean }>(db, 'k:plain')
    expect(result).toEqual({ name: 'kobato', atMs: 1782907200000, tags: ['a', 'b'], pinned: false })
  })

  it('returns null for missing keys', async () => {
    expect(await getItem(db, 'k:missing')).toBeNull()
  })

  it('stores no expiry when ttlSeconds is omitted, and the entry stays live', async () => {
    await setItem(db, 'k:immortal', 'value', { bucket: 'feed' })
    expect((await findRow('k:immortal'))?.expiresAt).toBeNull()
    expect(await getItem(db, 'k:immortal')).toBe('value')
  })

  it('stores an expiry in the future when ttlSeconds is given', async () => {
    const before = Date.now()
    await setItem(db, 'k:ttl', 'value', { ttlSeconds: 120, bucket: 'feed' })

    const row = await findRow('k:ttl')
    expect(row?.expiresAt).not.toBeNull()
    expect(row!.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 120_000)
    expect(await getItem(db, 'k:ttl')).toBe('value')
  })

  it('treats expired rows as misses on every read path', async () => {
    await db.insert(kvCache).values({ key: 'k:expired', bucket: 'feed', value: { json: 'stale' }, expiresAt: past() })

    expect(await getItem(db, 'k:expired')).toBeNull()
    expect(await getItemRaw(db, 'k:expired')).toBeNull()
    expect(await getItems(db, ['k:expired'])).toEqual([{ key: 'k:expired', value: null }])
  })

  it('requires an explicit bucket label on every write', async () => {
    await setItem(db, 'k:og', 'a', { bucket: 'og' })
    await setItem(db, 'k:feed', 'b', { bucket: 'feed' })

    expect((await findRow('k:og'))?.bucket).toBe('og')
    expect((await findRow('k:feed'))?.bucket).toBe('feed')
  })

  it('overwrites an existing entry, resetting bucket, expiry and the sibling blob', async () => {
    await setItemRaw(db, 'k:swap', Buffer.from('png'), { bucket: 'og' })
    await setItem(db, 'k:swap', { meta: true }, { bucket: 'feed' })

    const row = await findRow('k:swap')
    expect(row?.bucket).toBe('feed')
    expect(row?.blob).toBeNull()
    expect(row?.expiresAt).toBeNull()
    expect(await getItemRaw(db, 'k:swap')).toBeNull()
    expect(await getItem(db, 'k:swap')).toEqual({ meta: true })
  })

  it('round-trips a raw scalar payload written by direct SQL', async () => {
    // Mirrors direct-SQL scalar rows (the cache generation counters): plain-JSON storage reads them back as-is.
    await db.insert(kvCache).values({ key: 'k:counter', bucket: 'searchResult', value: 5 })
    expect(await getItem(db, 'k:counter')).toBe(5)
  })

  it('removeItem deletes the entry', async () => {
    await setItem(db, 'k:remove', 'value', { bucket: 'feed' })
    await removeItem(db, 'k:remove')
    expect(await findRow('k:remove')).toBeNull()
  })
})

describe('kv-store — raw entries', () => {
  it('round-trips a Buffer', async () => {
    const bytes = Buffer.concat([Buffer.from([0x89, 0x50]), Buffer.from('png-bytes')])
    await setItemRaw(db, 'k:raw', bytes, { ttlSeconds: 60, bucket: 'og' })
    expect(await getItemRaw(db, 'k:raw')).toEqual(bytes)
  })

  it('clears the sibling JSON value when a raw entry overwrites it', async () => {
    await setItem(db, 'k:swap-raw', { meta: true }, { bucket: 'feed' })
    await setItemRaw(db, 'k:swap-raw', Buffer.from('png'), { bucket: 'og' })

    const row = await findRow('k:swap-raw')
    expect(row?.value).toBeNull()
    expect(await getItem(db, 'k:swap-raw')).toBeNull()
    expect(await getItemRaw(db, 'k:swap-raw')).toEqual(Buffer.from('png'))
  })
})

describe('kv-store — getItems', () => {
  it('returns values in input order with nulls for missing keys', async () => {
    await setItem(db, 'k:a', 1, { bucket: 'feed' })
    await setItem(db, 'k:b', 2, { bucket: 'feed' })

    const result = await getItems(db, ['k:b', 'k:missing', 'k:a'])
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
