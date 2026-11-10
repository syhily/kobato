import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { countEntryFiles, getItemWithExpiry, resolveCacheRoot, setItem } from '@/server/infra/cache/file-store'
import { sweepExpiredKvEntries } from '@/server/infra/cache/kv-maintenance'
import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { session } from '@/server/infra/db/schema/session'
import { user } from '@/server/infra/db/schema/user'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

const past = () => new Date(Date.now() - 60_000)
const future = () => new Date(Date.now() + 3_600_000)
const TWO_HOURS_AGO = () => Date.now() / 1000 - 2 * 60 * 60

describe('sweepExpiredKvEntries', () => {
  it('removes expired cache files, keeps live/immortal ones, and sweeps both auth tables', async () => {
    await setItem('feed', 'k:expired', { json: 1 }, { ttlSeconds: -60 })
    await setItem('feed', 'k:live', { json: 2 }, { ttlSeconds: 3600 })
    // No TTL = never expires — must survive the sweep.
    await setItem('feed', 'k:immortal', { json: 3 })
    await db.insert(oneTimeToken).values([
      { key: 'comment:token:expired', payload: { json: {} }, expiresAt: past() },
      { key: 'comment:token:live', payload: { json: {} }, expiresAt: future() },
    ])
    await db.insert(session).values([
      { id: 'expired-sid', data: { json: {} }, expiresAt: past() },
      { id: 'live-sid', data: { json: {} }, expiresAt: future() },
    ])

    await sweepExpiredKvEntries(db)

    expect(await countEntryFiles('feed')).toBe(2)
    await expect(getItemWithExpiry('feed', 'k:expired')).resolves.toBeNull()
    await expect(getItemWithExpiry('feed', 'k:live')).resolves.toMatchObject({ value: { json: 2 } })
    await expect(getItemWithExpiry('feed', 'k:immortal')).resolves.toMatchObject({ value: { json: 3 } })
    expect((await db.select({ key: oneTimeToken.key }).from(oneTimeToken)).map((row) => row.key)).toEqual([
      'comment:token:live',
    ])
    expect((await db.select({ id: session.id }).from(session)).map((row) => row.id)).toEqual(['live-sid'])
  })

  it('reaps aged _tmp orphans and trash dirs, leaving young ones alone', async () => {
    await setItem('feed', 'k:live', 'value', { ttlSeconds: 3600 })
    const bucketDir = path.join(resolveCacheRoot(), 'feed')
    const tmpDir = path.join(bucketDir, '_tmp')
    const oldTmp = path.join(tmpDir, 'old.tmp')
    const freshTmp = path.join(tmpDir, 'fresh.tmp')
    writeFileSync(oldTmp, 'x')
    writeFileSync(freshTmp, 'x')
    utimesSync(oldTmp, TWO_HOURS_AGO(), TWO_HOURS_AGO())

    const oldTrash = path.join(resolveCacheRoot(), 'feed.trash-old')
    const freshTrash = path.join(resolveCacheRoot(), 'feed.trash-fresh')
    mkdirSync(oldTrash)
    mkdirSync(freshTrash)
    utimesSync(oldTrash, TWO_HOURS_AGO(), TWO_HOURS_AGO())

    await sweepExpiredKvEntries(db)

    const { readdirSync } = await import('node:fs')
    expect(readdirSync(tmpDir)).toEqual(['fresh.tmp'])
    expect(readdirSync(resolveCacheRoot()).sort()).toEqual(['feed', 'feed.trash-fresh'])
  })

  it('is a no-op on empty storage', async () => {
    await sweepExpiredKvEntries(db)
    expect(await db.select().from(oneTimeToken)).toEqual([])
    expect(await db.select().from(session)).toEqual([])
    expect(await countEntryFiles('feed')).toBe(0)
  })
})

describe('session table — user FK cascade', () => {
  it('deletes the session rows when their user is deleted', async () => {
    const [admin] = await db
      .insert(user)
      .values({ name: 'Admin', email: 'admin@example.com', password: 'hashed', role: 'admin' })
      .returning({ id: user.id })
    await db.insert(session).values({ id: 'owned-sid', userId: admin.id, data: { json: {} }, expiresAt: future() })

    await db.delete(user)

    expect(await db.select().from(session)).toEqual([])
  })
})
