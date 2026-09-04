import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { bumpPageView, flushPageViews } from '@/server/domains/analytics/services/pv-batcher'
import {
  decreaseLikes,
  increaseLikes,
  purgeStaleLikeTokens,
  queryLikes,
  queryMetadata,
  resetLikeTokenSweep,
  startLikeTokenSweep,
  validateLikeToken,
} from '@/server/domains/comments/services/likes'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { comment } from '@/server/infra/db/schema/comment'
import { like, metric } from '@/server/infra/db/schema/metric'
import { EMPTY_COMMENT_EDITOR_STATE } from '@/shared/lexical/comment-schema'

// Likes against the real in-memory engine: insert+bump, token lifecycle, purge cutoff.
const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

afterEach(() => {
  resetLikeTokenSweep()
  resetAllBatchers()
})

const POST_A = { type: 'post' as const, ownerId: 1 }
const POST_B = { type: 'post' as const, ownerId: 2 }

async function seedMetricRow(
  target: { type: 'post' | 'page'; ownerId: number },
  opts: { voteUp?: number; pv?: number; publicId?: string } = {},
): Promise<void> {
  await db.insert(metric).values({
    type: target.type,
    ownerId: target.ownerId,
    publicId: opts.publicId ?? crypto.randomUUID(),
    voteUp: opts.voteUp ?? 0,
    pv: opts.pv ?? 0,
  })
}

async function seedComment(ownerId: number, opts: { isPending?: boolean } = {}): Promise<void> {
  await db.insert(comment).values({
    type: 'post',
    ownerId,
    userId: 1,
    content: 'hello',
    body: EMPTY_COMMENT_EDITOR_STATE,
    rid: 0,
    isPending: opts.isPending ?? false,
  })
}

async function likeRows(): Promise<(typeof like.$inferSelect)[]> {
  return db.select().from(like)
}

describe('services/comments/likes — increaseLikes / decreaseLikes', () => {
  it('inserts the token row and bumps the counter atomically', async () => {
    await seedMetricRow(POST_A)

    const first = await increaseLikes(db, POST_A)
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{64}$/)
    expect(first.likes).toBe(1)

    const second = await increaseLikes(db, POST_A)
    expect(second.likes).toBe(2)
    expect(second.token).not.toBe(first.token)

    const rows = await likeRows()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.token)).toEqual(expect.arrayContaining([first.token, second.token]))
  })

  it('decrements only when the token is consumed, and the token cannot be reused', async () => {
    await seedMetricRow(POST_A)
    const { token } = await increaseLikes(db, POST_A)

    await expect(decreaseLikes(db, POST_A, token)).resolves.toBe(true)
    expect(await queryLikes(db, POST_A)).toBe(0)
    expect(await validateLikeToken(db, POST_A, token)).toBe(false)

    // A second undo with the same token reports the no-op honestly.
    await expect(decreaseLikes(db, POST_A, token)).resolves.toBe(false)
    expect(await queryLikes(db, POST_A)).toBe(0)
  })

  it('reports false when the token does not exist', async () => {
    await seedMetricRow(POST_A, { voteUp: 3 })

    await expect(decreaseLikes(db, POST_A, 'stale-token')).resolves.toBe(false)

    expect(await queryLikes(db, POST_A)).toBe(3)
  })
})

describe('services/comments/likes — queryLikes', () => {
  it('reads the counter and defaults a missing metric row to 0', async () => {
    await seedMetricRow(POST_A, { voteUp: 11 })

    expect(await queryLikes(db, POST_A)).toBe(11)
    expect(await queryLikes(db, POST_B)).toBe(0)
  })
})

describe('services/comments/likes — queryMetadata', () => {
  it('returns an empty map for an empty target list', async () => {
    const result = await queryMetadata(db, [], { likes: true, views: true, comments: true })
    expect(result.size).toBe(0)
  })

  it('aggregates likes/views/approved-comments per target, defaulting missing rows to 0', async () => {
    await seedMetricRow(POST_A, { voteUp: 5, pv: 100, publicId: 'uuid-a' })
    await seedComment(POST_A.ownerId)
    await seedComment(POST_A.ownerId)
    await seedComment(POST_A.ownerId)
    // Pending and soft-target rows must not count.
    await seedComment(POST_A.ownerId, { isPending: true })

    const result = await queryMetadata(db, [POST_A, POST_B], { likes: true, views: true, comments: true })

    expect(result.size).toBe(2)
    expect(result.get('post:1')).toEqual({ likes: 5, views: 100, comments: 3, publicId: 'uuid-a' })
    expect(result.get('post:2')).toEqual({ likes: 0, views: 0, comments: 0, publicId: '' })
  })

  it('reports comments as 0 when the comments option is off', async () => {
    await seedMetricRow(POST_A, { voteUp: 5, pv: 100, publicId: 'uuid-a' })
    await seedComment(POST_A.ownerId)

    const result = await queryMetadata(db, [POST_A], { likes: true, views: true, comments: false })

    expect(result.get('post:1')).toEqual({ likes: 5, views: 100, comments: 0, publicId: 'uuid-a' })
  })

  it('merges the unflushed page-view delta into views, without double-counting after the flush', async () => {
    await seedMetricRow(POST_A, { pv: 100, publicId: 'uuid-a' })
    initAllBatchers(getDatabaseHandle())

    bumpPageView(POST_A)
    bumpPageView(POST_A)
    bumpPageView(POST_B)

    const merged = await queryMetadata(db, [POST_A, POST_B], { likes: true, views: true, comments: false })
    expect(merged.get('post:1')?.views).toBe(102)
    // POST_B has no metric row at all — the pending delta still surfaces.
    expect(merged.get('post:2')?.views).toBe(1)

    // After the flush, the stored count carries the delta; the merge adds nothing.
    await flushPageViews()
    const flushed = await queryMetadata(db, [POST_A], { likes: true, views: true, comments: false })
    expect(flushed.get('post:1')?.views).toBe(102)
  })
})

describe('services/comments/likes — validateLikeToken', () => {
  it('is true only while the token row is active', async () => {
    await seedMetricRow(POST_A)
    const { token } = await increaseLikes(db, POST_A)

    expect(await validateLikeToken(db, POST_A, token)).toBe(true)
    expect(await validateLikeToken(db, POST_A, 'unknown')).toBe(false)

    await decreaseLikes(db, POST_A, token)
    expect(await validateLikeToken(db, POST_A, token)).toBe(false)
  })
})

describe('services/comments/likes — purgeStaleLikeTokens', () => {
  it('physically deletes only soft-deleted tokens older than 30 days', async () => {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const rows = [
      { token: 'old-deleted', deletedAt: new Date(now - 40 * dayMs) },
      { token: 'fresh-deleted', deletedAt: new Date(now - dayMs) },
      { token: 'active', deletedAt: null },
    ]
    for (const row of rows) {
      await db.insert(like).values({
        token: row.token,
        type: 'post',
        ownerId: 1,
        deletedAt: row.deletedAt,
        updatedAt: row.deletedAt ?? new Date(),
      })
    }

    await purgeStaleLikeTokens(db)

    const remaining = (await likeRows()).map((r) => r.token)
    expect(remaining).toEqual(expect.arrayContaining(['fresh-deleted', 'active']))
    expect(remaining).not.toContain('old-deleted')
  })
})

describe('services/comments/likes — sweep timer', () => {
  it('purges stale tokens on the hourly tick, starts idempotently, and stops on reset', async () => {
    const seedStaleToken = async (token: string) => {
      const deletedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
      await db.insert(like).values({ token, type: 'post', ownerId: 1, deletedAt, updatedAt: deletedAt })
    }

    vi.useFakeTimers()
    try {
      await seedStaleToken('sweep-me')
      // A duplicate start must not replace the live timer or arm a second one.
      startLikeTokenSweep(db)
      startLikeTokenSweep(db)

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect((await likeRows()).map((r) => r.token)).not.toContain('sweep-me')

      resetLikeTokenSweep()
      await seedStaleToken('after-reset')
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect((await likeRows()).map((r) => r.token)).toContain('after-reset')
    } finally {
      vi.useRealTimers()
    }
  })
})
