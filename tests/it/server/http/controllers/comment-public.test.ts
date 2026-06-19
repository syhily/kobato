import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyInklingDocument, inklingParagraph } from '#/_helpers/inkling'
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

vi.mock('@/server/infra/db/operations/user', () => ({
  findUserIdByEmail: vi.fn().mockResolvedValue(null),
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

vi.mock('@/server/render/avatar/fetch', () => ({
  fetchQQAvatarImage: vi.fn(),
  isQQEmail: () => false,
}))

vi.mock('@/server/render/avatar/cache', () => ({
  AvatarStatus: { HAVE_AVATAR: 'have', NO_AVATAR: 'none' },
  cacheAvatar: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/token', () => ({
  appendCommentToken: vi.fn(),
  issueCommentToken: vi.fn(),
  verifyCommentOwnership: vi.fn().mockResolvedValue({ ok: false, cleaned: [] }),
}))

vi.mock('@/server/domains/comments/services/moderate', () => ({
  updateComment: vi.fn(),
  getCommentById: vi.fn(),
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
const { avatarRouter } = await import('@/server/http/controllers/avatar.controller')
const { commentsPublicRouter } = await import('@/server/http/controllers/comments-public.controller')
const commentsRouter = commentsPublicRouter
const { likesRouter } = await import('@/server/http/controllers/likes.controller')

const validBody = inklingParagraph('hello')

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
})

describe('commentsRouter.edit', () => {
  it('throws BAD_REQUEST when rid is not numeric', async () => {
    const ctx = makePublicCtx()
    await expect(
      call(commentsRouter.edit, { rid: 'not-a-number', body: emptyInklingDocument() }, { context: ctx }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})
