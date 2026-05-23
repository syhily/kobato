import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/infra/db/operations/like', () => ({
  recordLikeAndCount: vi.fn(async () => 0),
  existsActiveLikeToken: vi.fn(),
  consumeActiveLikeToken: vi.fn(),
  metricVoteUp: vi.fn(),
  metricsByOwnerIds: vi.fn(),
  commentCountsByOwnerIds: vi.fn(),
  purgeOldLikeTokens: vi.fn(async () => undefined),
}))

vi.mock('@/server/infra/db/operations/metric', () => ({
  decrementMetricVotes: vi.fn(async () => undefined),
}))

const likeQueries = await import('@/server/infra/db/operations/like')
const metricQueries = await import('@/server/infra/db/operations/metric')
const { increaseLikes, decreaseLikes, purgeStaleLikeTokens, queryLikes, queryMetadata, validateLikeToken } =
  await import('@/server/domains/comments/likes')

const POST_A = { type: 'post' as const, ownerId: 1n }
const POST_B = { type: 'post' as const, ownerId: 2n }
const POST_X = { type: 'post' as const, ownerId: 9n }

beforeEach(() => {
  for (const fn of Object.values({ ...likeQueries, ...metricQueries })) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
})

describe('services/comments/likes — increaseLikes', () => {
  it('inserts a unique base64url token and reads the post-update count atomically', async () => {
    vi.mocked(likeQueries.recordLikeAndCount).mockResolvedValue(7)

    const result = await increaseLikes(POST_X)

    // Single round-trip — the transactional helper owns insert + bump + read.
    expect(likeQueries.recordLikeAndCount).toHaveBeenCalledOnce()
    // token is base64url-shaped (urlsafe alphabet, no padding) and 64 chars
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{64}$/)
    expect(result.likes).toBe(7)
    // The token and the target derive from the same call — pin that they're
    // written together (one call, both args present).
    const [insertedToken, insertedTarget] = vi.mocked(likeQueries.recordLikeAndCount).mock.calls[0]
    expect(insertedToken).toBe(result.token)
    expect(insertedTarget).toEqual(POST_X)
  })

  it('each call yields a fresh token (no token reuse / collision)', async () => {
    vi.mocked(likeQueries.recordLikeAndCount).mockResolvedValue(0)
    const a = await increaseLikes(POST_X)
    const b = await increaseLikes(POST_X)
    expect(a.token).not.toBe(b.token)
  })
})

describe('services/comments/likes — decreaseLikes', () => {
  it("no-ops when the token doesn't exist (anonymous undo of someone else's like)", async () => {
    vi.mocked(likeQueries.consumeActiveLikeToken).mockResolvedValue(false)

    await decreaseLikes(POST_X, 'stale-token')

    expect(likeQueries.consumeActiveLikeToken).toHaveBeenCalledWith(POST_X, 'stale-token')
    expect(metricQueries.decrementMetricVotes).not.toHaveBeenCalled()
  })

  it('decrements the page counter only when the token is consumed', async () => {
    vi.mocked(likeQueries.consumeActiveLikeToken).mockResolvedValue(true)

    await decreaseLikes(POST_X, 'good-token')

    expect(likeQueries.consumeActiveLikeToken).toHaveBeenCalledWith(POST_X, 'good-token')
    expect(metricQueries.decrementMetricVotes).toHaveBeenCalledOnce()
    expect(vi.mocked(metricQueries.decrementMetricVotes).mock.calls[0][0]).toEqual(POST_X)
  })
})

describe('services/comments/likes — queryLikes', () => {
  it('delegates to metricVoteUp with the entity target', async () => {
    vi.mocked(likeQueries.metricVoteUp).mockResolvedValue(11)

    const count = await queryLikes(POST_X)

    expect(count).toBe(11)
    expect(likeQueries.metricVoteUp).toHaveBeenCalledOnce()
    expect(vi.mocked(likeQueries.metricVoteUp).mock.calls[0][0]).toEqual(POST_X)
  })
})

describe('services/comments/likes — queryMetadata', () => {
  it('returns an empty Map for an empty target list (no DB roundtrip)', async () => {
    const result = await queryMetadata([], { likes: true, views: true, comments: true })

    expect(result.size).toBe(0)
    expect(likeQueries.metricsByOwnerIds).not.toHaveBeenCalled()
    expect(likeQueries.commentCountsByOwnerIds).not.toHaveBeenCalled()
  })

  it('aggregates likes/views/comments per target, defaulting missing rows to 0', async () => {
    vi.mocked(likeQueries.metricsByOwnerIds).mockImplementation(async (_type, ownerIds) =>
      ownerIds.includes(POST_A.ownerId)
        ? [{ type: 'post', ownerId: POST_A.ownerId, publicId: 'uuid-a', like: 5, view: 100 }]
        : [],
    )
    vi.mocked(likeQueries.commentCountsByOwnerIds).mockImplementation(async (_type, ownerIds) =>
      ownerIds.includes(POST_A.ownerId) ? [{ ownerId: POST_A.ownerId, count: 3 }] : [],
    )

    const result = await queryMetadata([POST_A, POST_B], {
      likes: true,
      views: true,
      comments: true,
    })

    expect(result.size).toBe(2)
    expect(result.get('post:1')).toEqual({ likes: 5, views: 100, comments: 3, publicId: 'uuid-a' })
    expect(result.get('post:2')).toEqual({ likes: 0, views: 0, comments: 0, publicId: '' })
  })

  it('skips the comment-count query when comments=false (perf knob)', async () => {
    vi.mocked(likeQueries.metricsByOwnerIds).mockResolvedValue([])

    await queryMetadata([POST_A], { likes: true, views: true, comments: false })

    expect(likeQueries.commentCountsByOwnerIds).not.toHaveBeenCalled()
  })
})

describe('services/comments/likes — validateLikeToken', () => {
  it('returns true iff the active token row exists in the DB', async () => {
    vi.mocked(likeQueries.existsActiveLikeToken).mockResolvedValueOnce(true)
    expect(await validateLikeToken(POST_X, 'tok')).toBe(true)
    vi.mocked(likeQueries.existsActiveLikeToken).mockResolvedValueOnce(false)
    expect(await validateLikeToken(POST_X, 'tok')).toBe(false)
  })

  it('validates against active tokens so soft-deleted rows do not keep the button liked', async () => {
    vi.mocked(likeQueries.existsActiveLikeToken).mockResolvedValue(false)

    await validateLikeToken(POST_X, 'deleted-token')

    expect(likeQueries.existsActiveLikeToken).toHaveBeenCalledOnce()
    expect(likeQueries.existsActiveLikeToken).toHaveBeenCalledWith(POST_X, 'deleted-token')
  })

  it('does not invoke the purge sweep on the validation hot path', async () => {
    // The previous implementation ran a 1% probabilistic table-wide
    // purge per validate call. The sweep now lives behind a guarded
    // `setInterval`, so the validate hot path must stay query-only.
    vi.mocked(likeQueries.existsActiveLikeToken).mockResolvedValue(true)
    await validateLikeToken(POST_X, 'tok')
    expect(likeQueries.purgeOldLikeTokens).not.toHaveBeenCalled()
  })
})

describe('services/comments/likes — purgeStaleLikeTokens', () => {
  it('delegates the soft-deleted token cutoff to the query layer', async () => {
    await purgeStaleLikeTokens()

    expect(likeQueries.purgeOldLikeTokens).toHaveBeenCalledOnce()
    expect(vi.mocked(likeQueries.purgeOldLikeTokens).mock.calls[0][0]).toBeInstanceOf(Date)
  })
})
