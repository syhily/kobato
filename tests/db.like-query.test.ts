import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vite-plus/test'

import { consumeActiveLikeToken, existsActiveLikeToken, purgeOldLikeTokens } from '@/server/infra/db/operations/like'
import { db } from '@/server/infra/db/pool'
import { like } from '@/server/infra/db/schema'

const POST_A = { type: 'post' as const, ownerId: 1n }

beforeEach(async () => {
  await db.delete(like)
})

describe('db/query/like.server', () => {
  it('purges only soft-deleted expired like tokens', async () => {
    const cutoff = new Date('2024-02-01T00:00:00.000Z')
    const before = new Date('2024-01-15T00:00:00.000Z')
    const after = new Date('2024-03-01T00:00:00.000Z')

    await db.insert(like).values([
      { token: 'active', type: 'post', ownerId: 1n },
      { token: 'old-deleted', type: 'post', ownerId: 1n, deletedAt: before },
      { token: 'new-deleted', type: 'post', ownerId: 1n, deletedAt: after },
    ])

    await purgeOldLikeTokens(cutoff)

    const rows = await db.select({ token: like.token }).from(like)
    const tokens = rows.map((r) => r.token)
    expect(tokens).toContain('active')
    expect(tokens).toContain('new-deleted')
    expect(tokens).not.toContain('old-deleted')
  })

  it('checks like token existence against active rows only', async () => {
    await db.insert(like).values([
      { token: 'tok-active', type: 'post', ownerId: 1n },
      { token: 'tok-deleted', type: 'post', ownerId: 1n, deletedAt: new Date() },
    ])

    expect(await existsActiveLikeToken(POST_A, 'tok-active')).toBe(true)
    expect(await existsActiveLikeToken(POST_A, 'tok-deleted')).toBe(false)
    expect(await existsActiveLikeToken(POST_A, 'noexist')).toBe(false)
  })

  it('atomically consumes active like tokens with one conditional update', async () => {
    await db.insert(like).values([
      { token: 'tok-consume', type: 'post', ownerId: 1n },
      { token: 'tok-deleted', type: 'post', ownerId: 1n, deletedAt: new Date() },
    ])

    const result = await consumeActiveLikeToken(POST_A, 'tok-consume')
    expect(result).toBe(true)

    // Verify the row is now soft-deleted
    const rows = await db.select({ deletedAt: like.deletedAt }).from(like).where(eq(like.token, 'tok-consume'))
    expect(rows[0]?.deletedAt).not.toBeNull()

    // Already deleted token cannot be consumed again
    expect(await consumeActiveLikeToken(POST_A, 'tok-deleted')).toBe(false)
  })
})
