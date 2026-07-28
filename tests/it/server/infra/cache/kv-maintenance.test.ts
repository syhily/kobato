import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { clearAllTables } from '#/_helpers/integration-db'
import { createTestDatabase, closeTestDatabase } from '#/_helpers/integration-db'
import { sweepExpiredKvEntries } from '@/server/infra/cache/kv-maintenance'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { session } from '@/server/infra/db/schema/session'
import { user } from '@/server/infra/db/schema/user'

const handle = createTestDatabase()
const db: Database = handle.db

afterAll(async () => {
  closeTestDatabase(handle)
})

beforeEach(async () => {
  await clearAllTables(db)
})

const past = () => new Date(Date.now() - 60_000)
const future = () => new Date(Date.now() + 3_600_000)

describe('sweepExpiredKvEntries', () => {
  it('deletes expired rows from all three tables and keeps live ones', async () => {
    await db.insert(kvCache).values([
      { key: 'k:expired', bucket: 'misc', value: { json: 1 }, expiresAt: past() },
      { key: 'k:live', bucket: 'misc', value: { json: 2 }, expiresAt: future() },
      // NULL expires_at means "never expires" — must survive the sweep.
      { key: 'k:immortal', bucket: 'misc', value: { json: 3 }, expiresAt: null },
    ])
    await db.insert(oneTimeToken).values([
      { key: 'comment:token:expired', payload: { json: {} }, expiresAt: past() },
      { key: 'comment:token:live', payload: { json: {} }, expiresAt: future() },
    ])
    await db.insert(session).values([
      { id: 'expired-sid', data: { json: {} }, expiresAt: past() },
      { id: 'live-sid', data: { json: {} }, expiresAt: future() },
    ])

    await sweepExpiredKvEntries(db)

    expect((await db.select({ key: kvCache.key }).from(kvCache)).map((row) => row.key).sort()).toEqual([
      'k:immortal',
      'k:live',
    ])
    expect((await db.select({ key: oneTimeToken.key }).from(oneTimeToken)).map((row) => row.key)).toEqual([
      'comment:token:live',
    ])
    expect((await db.select({ id: session.id }).from(session)).map((row) => row.id)).toEqual(['live-sid'])
  })

  it('is a no-op on empty tables', async () => {
    await sweepExpiredKvEntries(db)
    expect(await db.select().from(kvCache)).toEqual([])
    expect(await db.select().from(oneTimeToken)).toEqual([])
    expect(await db.select().from(session)).toEqual([])
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
