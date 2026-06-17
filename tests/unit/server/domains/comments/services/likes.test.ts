import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/infra/db/operations/like', () => ({
  commentCountsByOwnerIds: vi.fn(),
  consumeActiveLikeToken: vi.fn(),
  existsActiveLikeToken: vi.fn(),
  metricsByOwnerIds: vi.fn(),
  metricVoteUp: vi.fn(),
  purgeOldLikeTokens: vi.fn(),
  recordLikeAndCount: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/metric', () => ({
  decrementMetricVotes: vi.fn(),
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  })),
}))

vi.mock('@/shared/utils/security', () => ({
  makeToken: vi.fn(() => 'generated-token'),
}))

import * as likeOps from '@/server/infra/db/operations/like'
import { decrementMetricVotes } from '@/server/infra/db/operations/metric'

const dbMock = {
  transaction: async (fn: (tx: NodePgDatabase) => Promise<unknown>) => fn(dbMock as NodePgDatabase),
} as NodePgDatabase

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

describe('comments likes service', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resetLikeTokenSweep()
    ;(likeOps.recordLikeAndCount as ReturnType<typeof vi.fn>).mockResolvedValue(5)
    ;(likeOps.metricVoteUp as ReturnType<typeof vi.fn>).mockResolvedValue(7)
    ;(likeOps.existsActiveLikeToken as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    ;(likeOps.consumeActiveLikeToken as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    ;(likeOps.purgeOldLikeTokens as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  })

  afterEach(() => {
    resetLikeTokenSweep()
  })

  it('increases likes and returns a token', async () => {
    const result = await increaseLikes(dbMock, { type: 'post', ownerId: 1n })
    expect(result.token).toBe('generated-token')
    expect(result.likes).toBe(5)
  })

  it('decreases likes when token is active', async () => {
    await decreaseLikes(dbMock, { type: 'post', ownerId: 1n }, 'token')
    expect(decrementMetricVotes).toHaveBeenCalled()
  })

  it('queries likes', async () => {
    const count = await queryLikes(dbMock, { type: 'post', ownerId: 1n })
    expect(count).toBe(7)
  })

  it('queries metadata for posts and pages', async () => {
    ;(likeOps.metricsByOwnerIds as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ type: 'post', ownerId: 1n, publicId: 'p1', like: 5, view: 10 }])
      .mockResolvedValueOnce([{ type: 'page', ownerId: 2n, publicId: 'p2', like: 3, view: 8 }])
    ;(likeOps.commentCountsByOwnerIds as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ ownerId: 1n, count: 2 }])
      .mockResolvedValueOnce([{ ownerId: 2n, count: 4 }])

    const map = await queryMetadata(
      dbMock,
      [
        { type: 'post', ownerId: 1n },
        { type: 'page', ownerId: 2n },
      ],
      { likes: true, views: true, comments: true },
    )

    expect(map.size).toBe(2)
  })

  it('returns an empty map for empty targets', async () => {
    const map = await queryMetadata(dbMock, [], { likes: true, views: true, comments: true })
    expect(map.size).toBe(0)
  })

  it('validates a like token', async () => {
    const ok = await validateLikeToken(dbMock, { type: 'post', ownerId: 1n }, 'token')
    expect(ok).toBe(true)
  })

  it('purges stale like tokens', async () => {
    await purgeStaleLikeTokens(dbMock)
    expect(likeOps.purgeOldLikeTokens).toHaveBeenCalled()
  })

  it('starts and resets the like token sweep timer', () => {
    startLikeTokenSweep(dbMock)
    startLikeTokenSweep(dbMock)
    resetLikeTokenSweep()
  })
})
