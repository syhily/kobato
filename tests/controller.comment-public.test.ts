import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makePublicCtx } from './_helpers/mock-ctx'

// `comment-public.controller` orchestrates many service modules; we
// mock only the slices the tested methods reach into.

vi.mock('@/server/infra/rate-limit', () => ({
  tryLikeIncreaseRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
  tryCommentPostRateLimit: vi.fn(),
  tryCommentPostRateLimitByEmail: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/metric', () => ({
  findMetricByPublicId: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  findUserIdByEmail: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/server/domains/comments/likes', () => ({
  decreaseLikes: vi.fn(),
  increaseLikes: vi.fn().mockResolvedValue({ likes: 1, token: 't' }),
  queryLikes: vi.fn().mockResolvedValue(0),
  validateLikeToken: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/public-query', () => ({
  loadComments: vi.fn(),
  parseComments: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/server/domains/comments/services/mutate', () => ({
  createComment: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/shared', () => ({
  resolveMetricTarget: vi.fn(),
  safeResolveMetricTarget: vi.fn(),
}))

vi.mock('@/server/render/avatar/fetch', () => ({
  fetchQQAvatarImage: vi.fn(),
  isQQEmail: () => false,
}))

vi.mock('@/server/render/avatar/cache', () => ({
  AvatarStatus: { HAVE_AVATAR: 'have', NO_AVATAR: 'none' },
  cacheAvatar: vi.fn(),
}))

vi.mock('@/server/domains/comments/token', () => ({
  appendCommentToken: vi.fn(),
  issueCommentToken: vi.fn(),
  verifyCommentOwnership: vi.fn().mockResolvedValue({ ok: false, cleaned: [] }),
}))

vi.mock('@/server/domains/comments/services/moderate', () => ({
  updateComment: vi.fn(),
  getCommentById: vi.fn(),
}))

vi.mock('@/server/domains/comments/repos/public-query', () => ({
  findCommentWithUserById: vi.fn(),
}))

vi.mock('@/server/domains/auth/primitives', () => ({
  userSession: () => undefined,
}))

vi.mock('@/shared/config/blog', () => ({
  requireBlogSettingsSection: (section: string) => {
    if (section === 'siteIdentity') {
      return { website: 'https://example.test' }
    }
    return { comments: { tokenTtlSeconds: 60, size: 10 } }
  },
}))

const rateLimitMod = await import('@/server/infra/rate-limit')
const publicQuery = await import('@/server/domains/comments/services/public-query')
const shared = await import('@/server/domains/comments/services/shared')
const { avatarRouter } = await import('@/server/http/controllers/avatar.controller')
const { commentsPublicRouter } = await import('@/server/http/controllers/comments-public.controller')
const commentsRouter = commentsPublicRouter
const { likesRouter } = await import('@/server/http/controllers/likes.controller')

describe('likesRouter.increase', () => {
  it('throws TOO_MANY_REQUESTS when the per-IP rate limit is exceeded', async () => {
    vi.mocked(rateLimitMod.tryLikeIncreaseRateLimit).mockResolvedValueOnce({
      exceeded: true,
    } as never)
    const ctx = makePublicCtx({ clientAddress: '1.2.3.4' })
    await expect(call(likesRouter.increase, { key: 'pk-1' }, { context: ctx })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    })
  })
})

describe('avatarRouter.find', () => {
  it('returns the resolved avatar URL for non-QQ email', async () => {
    const ctx = makePublicCtx()
    const res = (await call(avatarRouter.find, { email: 'someone@example.com' }, { context: ctx })) as {
      avatar: string
    }
    expect(res.avatar).toMatch(/^https:\/\/example\.test\/images\/avatar\/.+\.png$/)
  })
})

describe('commentsRouter.loadComments', () => {
  it('throws NOT_FOUND when the metric public_id has no matching target', async () => {
    const { ORPCError } = await import('@orpc/server')
    vi.mocked(shared.resolveMetricTarget).mockRejectedValueOnce(
      new ORPCError('NOT_FOUND', { message: '评论目标不存在' }),
    )
    const ctx = makePublicCtx()
    await expect(
      call(commentsRouter.loadComments, { page_key: 'missing', offset: 0 }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws BAD_GATEWAY when the comment loader fails', async () => {
    vi.mocked(shared.resolveMetricTarget).mockResolvedValueOnce({ type: 'post', ownerId: 1n })
    vi.mocked(publicQuery.loadComments).mockResolvedValueOnce(null)
    const ctx = makePublicCtx()
    await expect(
      call(commentsRouter.loadComments, { page_key: 'pk-1', offset: 0 }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'BAD_GATEWAY' })
  })
})
