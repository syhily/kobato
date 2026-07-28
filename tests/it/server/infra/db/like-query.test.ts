import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { clearAllTables } from '#/_helpers/integration-db'
import { createTestDatabase, closeTestDatabase } from '#/_helpers/integration-db'
import { consumeActiveLikeToken, existsActiveLikeToken, purgeOldLikeTokens } from '@/server/infra/db/operations/like'
import { like } from '@/server/infra/db/schema/metric'

const handle = createTestDatabase()
const db: Database = handle.db

afterAll(async () => {
  closeTestDatabase(handle)
})

const POST_A = { type: 'post' as const, ownerId: 1 }

beforeEach(async () => {
  await clearAllTables(db)
})

describe('db/query/like.server', () => {
  it('purges only soft-deleted expired like tokens', async () => {
    const cutoff = new Date('2024-02-01T00:00:00.000Z')
    const before = new Date('2024-01-15T00:00:00.000Z')
    const after = new Date('2024-03-01T00:00:00.000Z')

    await db.insert(like).values([
      { token: 'active', type: 'post', ownerId: 1 },
      { token: 'old-deleted', type: 'post', ownerId: 1, deletedAt: before },
      { token: 'new-deleted', type: 'post', ownerId: 1, deletedAt: after },
    ])

    await purgeOldLikeTokens(db, cutoff)

    const rows = await db.select({ token: like.token }).from(like)
    const tokens = rows.map((r) => r.token)
    expect(tokens).toContain('active')
    expect(tokens).toContain('new-deleted')
    expect(tokens).not.toContain('old-deleted')
  })

  it('checks like token existence against active rows only', async () => {
    await db.insert(like).values([
      { token: 'tok-active', type: 'post', ownerId: 1 },
      { token: 'tok-deleted', type: 'post', ownerId: 1, deletedAt: new Date() },
    ])

    expect(await existsActiveLikeToken(db, POST_A, 'tok-active')).toBe(true)
    expect(await existsActiveLikeToken(db, POST_A, 'tok-deleted')).toBe(false)
    expect(await existsActiveLikeToken(db, POST_A, 'noexist')).toBe(false)
  })

  it('atomically consumes active like tokens with one conditional update', async () => {
    await db.insert(like).values([
      { token: 'tok-consume', type: 'post', ownerId: 1 },
      { token: 'tok-deleted', type: 'post', ownerId: 1, deletedAt: new Date() },
    ])

    const result = await consumeActiveLikeToken(db, POST_A, 'tok-consume')
    expect(result).toBe(true)

    // Verify the row is now soft-deleted
    const rows = await db.select({ deletedAt: like.deletedAt }).from(like).where(eq(like.token, 'tok-consume'))
    expect(rows[0]?.deletedAt).not.toBeNull()

    // Already deleted token cannot be consumed again
    expect(await consumeActiveLikeToken(db, POST_A, 'tok-deleted')).toBe(false)
  })
})
