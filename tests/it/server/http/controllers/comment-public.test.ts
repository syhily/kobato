import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makePublicCtx } from '#/_helpers/mock-ctx'

// `comment-public.controller` orchestrates many service modules; we
// mock only the slices the tested methods reach into.

vi.mock('@/server/infra/rate-limit', () => ({
  tryLikeIncreaseRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
  tryCommentPostRateLimit: vi.fn(),
  tryCommentPostRateLimitByEmail: vi.fn(),
  tryResourceRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
}))

vi.mock('@/server/infra/db/operations/metric', () => ({
  findMetricByPublicId: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/likes', () => ({
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

vi.mock('@/server/domains/comments/services/avatar', () => ({
  fetchQQAvatarImage: vi.fn(),
  isQQEmail: () => false,
}))

vi.mock('@/server/http/resources/avatar-cache', () => ({
  AvatarStatus: { HAVE_AVATAR: 0, NO_AVATAR: 1 },
  cacheAvatar: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/token', () => ({
  appendCommentToken: vi.fn(),
  issueCommentToken: vi.fn(),
  verifyCommentOwnership: vi.fn().mockResolvedValue({ token: null, cleaned: [] }),
}))

vi.mock('@/server/domains/comments/services/moderate', () => ({
  updateComment: vi.fn(),
}))

vi.mock('@/server/domains/comments/repos/public-query/by-id', () => ({
  findCommentWithUserById: vi.fn(),
}))

vi.mock('@/server/domains/auth/primitives', () => ({
  userSession: () => undefined,
}))

vi.mock('@/shared/config/getters', () => ({
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
const mutate = await import('@/server/domains/comments/services/mutate')
const token = await import('@/server/domains/comments/services/token')
const byId = await import('@/server/domains/comments/repos/public-query/by-id')
const { avatarRouter } = await import('@/server/http/controllers/avatar.controller')
const { commentsPublicRouter } = await import('@/server/http/controllers/comments-public.controller')
const commentsRouter = commentsPublicRouter
const { likesRouter } = await import('@/server/http/controllers/likes.controller')

const validBody = [
  { _type: 'block' as const, _key: 'b1', children: [{ _type: 'span' as const, _key: 's1', text: 'hello' }] },
]

function makeValidReplyInput() {
  return {
    page_key: 'https://example.test/post/1',
    name: 'Alice',
    email: 'alice@example.com',
    body: validBody,
  }
}

function makeMockComment(input: { page_key: string; name: string; email: string; body: unknown; rid?: number }) {
  return {
    id: 1n,
    createAt: new Date(),
    updatedAt: new Date(),
    deleteAt: null,
    body: input.body,
    type: 'post' as const,
    ownerId: null,
    userId: 1n,
    isVerified: false,
    rid: input.rid ?? 0,
    isCollapsed: false,
    isPending: true,
    isPinned: false,
    voteUp: 0,
    voteDown: 0,
    rootId: null,
    name: input.name,
    emailVerified: false,
    link: null,
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    content: null,
    ua: null,
    ip: '127.0.0.1',
    email: input.email,
  } as import('@/shared/types/comments').CommentAndUser
}

describe('likesRouter.increase', () => {
  it('throws TOO_MANY_REQUESTS when the per-IP rate limit is exceeded', async () => {
    vi.mocked(rateLimitMod.tryLikeIncreaseRateLimit).mockResolvedValueOnce({
      exceeded: true,
      count: 1,
    })
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

describe('commentsRouter.replyComment', () => {
  beforeEach(() => {
    vi.mocked(rateLimitMod.tryCommentPostRateLimit).mockResolvedValue({ exceeded: false, count: 0 })
    vi.mocked(rateLimitMod.tryCommentPostRateLimitByEmail).mockResolvedValue({ exceeded: false, count: 0 })
    vi.mocked(token.issueCommentToken).mockResolvedValue('token-1')
    vi.mocked(token.appendCommentToken).mockReturnValue({})
  })

  it('throws BAD_REQUEST when link is not an HTTP URL', async () => {
    const ctx = makePublicCtx()
    await expect(
      call(commentsRouter.replyComment, { ...makeValidReplyInput(), link: 'javascript:alert(1)' }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('throws BAD_REQUEST when name exceeds 100 characters', async () => {
    const ctx = makePublicCtx()
    await expect(
      call(commentsRouter.replyComment, { ...makeValidReplyInput(), name: 'a'.repeat(101) }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('succeeds with a valid HTTP link and normal name', async () => {
    const input = { ...makeValidReplyInput(), link: 'https://example.test/about' }
    vi.mocked(mutate.createComment).mockResolvedValueOnce(makeMockComment(input))
    const ctx = makePublicCtx()
    const res = await call(commentsRouter.replyComment, input, { context: ctx })
    expect(res).toMatchObject({ comment: expect.objectContaining({ name: 'Alice', link: null }) })
    expect(mutate.createComment).toHaveBeenCalledOnce()
  })
})

describe('commentsRouter.getRaw', () => {
  it('throws BAD_REQUEST when rid is not numeric', async () => {
    const ctx = makePublicCtx()
    await expect(call(commentsRouter.getRaw, { rid: 'not-a-number' }, { context: ctx })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('returns the body and refreshes the comment-token cookie on a valid token', async () => {
    vi.mocked(token.verifyCommentOwnership).mockResolvedValueOnce({
      token: 'tok-1',
      cleaned: { 'pk-1': [{ token: 'tok-1', expiresAt: 123 }] },
    })
    vi.mocked(byId.findCommentWithUserById).mockResolvedValueOnce({ body: validBody } as never)
    const ctx = makePublicCtx()
    const res = (await call(commentsRouter.getRaw, { rid: '1' }, { context: ctx })) as { body: unknown }
    expect(res.body).toEqual(validBody)
    expect(ctx.responseHeaders.get('Set-Cookie')).toContain('__comment_tokens=')
  })

  it('throws FORBIDDEN without refreshing the cookie when no token matches', async () => {
    const ctx = makePublicCtx()
    await expect(call(commentsRouter.getRaw, { rid: '1' }, { context: ctx })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(ctx.responseHeaders.get('Set-Cookie')).toBeNull()
  })
})

describe('commentsRouter.edit', () => {
  it('throws BAD_REQUEST when rid is not numeric', async () => {
    const ctx = makePublicCtx()
    await expect(call(commentsRouter.edit, { rid: 'not-a-number', body: [] }, { context: ctx })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})
