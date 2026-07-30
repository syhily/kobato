import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { issueCommentToken } from '@/server/domains/comments/services/token'
import { extractRequestFacts } from '@/server/http/utils/request-facts'
import { comment } from '@/server/infra/db/schema/comment'
import { metric } from '@/server/infra/db/schema/metric'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'
import { serializeCommentTokensCookie } from '@/shared/utils/comment-token'

// The public comment controllers run against the real in-memory engine:
// zod input validation, the in-process rate limiter (reset per test),
// metric resolution, comment creation, token issuance, and the cookie
// round trip are all real. Only two seams stay mocked:
//
//   * `services/email` — outbound mail is a true external;
//   * `services/public-query`'s `loadComments` — kept as a thin spy over
//     the REAL implementation so one test can force the defensive
//     `null` return (the real loader never returns null; the branch
//     exists to translate that into BAD_GATEWAY).

vi.mock('@/server/domains/comments/services/email', () => ({
  sendApprovedComment: vi.fn(async () => undefined),
  sendNewComment: vi.fn(async () => undefined),
  sendNewReply: vi.fn(async () => undefined),
}))

vi.mock('@/server/domains/comments/services/public-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/comments/services/public-query')>()
  return { ...actual, loadComments: vi.fn(actual.loadComments) }
})

const publicQuery = await import('@/server/domains/comments/services/public-query')
const { avatarRouter } = await import('@/server/http/controllers/avatar.controller')
const { commentsPublicRouter } = await import('@/server/http/controllers/comments-public.controller')
const commentsRouter = commentsPublicRouter
const { likesRouter } = await import('@/server/http/controllers/likes.controller')

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  __resetRateLimitsForTests()
  vi.clearAllMocks()
})

async function seedUser(opts: Partial<typeof user.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(user)
    .values({
      name: opts.name ?? 'Alice',
      email: opts.email ?? `alice-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      ...opts,
    })
    .returning({ id: user.id })
  return rows[0]!.id
}

async function seedPost(slug: string): Promise<number> {
  const rows = await db
    .insert(post)
    .values({
      slug,
      title: `Post ${slug}`,
      summary: '',
      published: true,
      publishedRevisionId: 1,
    })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function seedMetricRow(type: 'post' | 'page', ownerId: number, publicId: string): Promise<string> {
  // voteUp must start at 0, not NULL — `NULL + 1` is NULL in SQLite.
  await db.insert(metric).values({ type, ownerId, publicId, voteUp: 0, pv: 0 })
  return publicId
}

async function seedComment(opts: Partial<typeof comment.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(comment)
    .values({
      type: opts.type ?? 'post',
      ownerId: opts.ownerId ?? 1,
      userId: opts.userId ?? 1,
      content: opts.content ?? 'hello',
      body: opts.body ?? [],
      rid: opts.rid ?? 0,
      rootId: opts.rootId ?? 0,
      isPending: opts.isPending ?? false,
      ...opts,
    })
    .returning({ id: comment.id })
  return rows[0]!.id
}

const validBody: CommentBody = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    children: [{ _type: 'span', _key: 's1', text: 'hello', marks: [] }],
    markDefs: [],
  },
]

function makeValidReplyInput() {
  return {
    page_key: 'pub-reply',
    name: 'Alice',
    email: 'alice@example.com',
    body: validBody,
  }
}

/** A public ctx whose request carries the given raw Cookie header. */
function makePublicCtxWithCookie(cookie: string): ReturnType<typeof makePublicCtx> {
  const request = new Request('http://localhost/rpc', { headers: { cookie } })
  const ctx = makePublicCtx({ db })
  ctx.request = request
  ctx.requestFacts = extractRequestFacts(request)
  return ctx
}

describe('likesRouter.increase', () => {
  it('throws TOO_MANY_REQUESTS when the per-IP rate limit is exceeded', async () => {
    // Shrink the like bucket so a single hit trips the limiter — the
    // real in-process fixed window, not a mock.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        likeIncreaseIp: { windowSeconds: 60, maxAttempts: 0 },
      },
    })
    const ctx = makePublicCtx({ db, clientAddress: '1.2.3.4' })
    await expect(call(likesRouter.increase, { key: 'pk-1' }, { context: ctx })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    })
  })

  it('increments the counter and issues a token against the real metric row', async () => {
    const pid = await seedPost('likeable')
    await seedMetricRow('post', pid, 'pk-like')
    const ctx = makePublicCtx({ db, clientAddress: '1.2.3.4' })

    const first = await call(likesRouter.increase, { key: 'pk-like' }, { context: ctx })
    expect(first).toMatchObject({ key: 'pk-like', likes: 1 })
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{64}$/)

    const second = await call(likesRouter.increase, { key: 'pk-like' }, { context: ctx })
    expect(second.likes).toBe(2)
    expect(second.token).not.toBe(first.token)
  })
})

describe('avatarRouter.find', () => {
  it('returns the resolved avatar URL for non-QQ email', async () => {
    const ctx = makePublicCtx({ db })
    const res = await call(avatarRouter.find, { email: 'someone@example.com' }, { context: ctx })
    expect(res.avatar).toMatch(/^https:\/\/example\.com\/images\/avatar\/[0-9a-f]{64}\.png\?s=120$/)
  })
})

describe('commentsRouter.loadComments', () => {
  it('throws NOT_FOUND when the metric public_id has no matching target', async () => {
    const ctx = makePublicCtx({ db })
    await expect(
      call(commentsRouter.loadComments, { page_key: 'missing', offset: 0 }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws BAD_GATEWAY when the comment loader fails', async () => {
    // The real loader never returns null — this pins the controller's
    // defensive translation of that impossible branch into BAD_GATEWAY.
    const pid = await seedPost('gateway')
    await seedMetricRow('post', pid, 'pk-gateway')
    vi.mocked(publicQuery.loadComments).mockResolvedValueOnce(null)
    const ctx = makePublicCtx({ db })
    await expect(
      call(commentsRouter.loadComments, { page_key: 'pk-gateway', offset: 0 }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'BAD_GATEWAY' })
  })

  it('loads the approved thread for a seeded page', async () => {
    const uid = await seedUser({ name: 'Alice', email: 'alice@example.com' })
    const pid = await seedPost('threaded')
    await seedMetricRow('post', pid, 'pk-thread')
    await seedComment({ userId: uid, ownerId: pid, content: 'first', isPending: false })
    await seedComment({ userId: uid, ownerId: pid, content: 'pending', isPending: true })

    const ctx = makePublicCtx({ db })
    const res = await call(commentsRouter.loadComments, { page_key: 'pk-thread', offset: 0 }, { context: ctx })

    // Anonymous viewers only see the approved comment; the pending one
    // stays hidden until moderation.
    expect(res.comments).toHaveLength(1)
    expect(res.comments[0]).toMatchObject({ name: 'Alice', isPending: false })
    expect(res.next).toBe(false)
    expect(publicQuery.loadComments).toHaveBeenCalled()
  })
})

describe('commentsRouter.replyComment', () => {
  it('throws BAD_REQUEST when link is not an HTTP URL', async () => {
    const ctx = makePublicCtx({ db })
    await expect(
      call(commentsRouter.replyComment, { ...makeValidReplyInput(), link: 'javascript:alert(1)' }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('throws BAD_REQUEST when name exceeds 100 characters', async () => {
    const ctx = makePublicCtx({ db })
    await expect(
      call(commentsRouter.replyComment, { ...makeValidReplyInput(), name: 'a'.repeat(101) }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('persists the comment and sets the ownership-token cookie on a valid submission', async () => {
    const pid = await seedPost('reply-target')
    await seedMetricRow('post', pid, 'pub-reply')
    const ctx = makePublicCtx({ db })

    const res = await call(
      commentsRouter.replyComment,
      { ...makeValidReplyInput(), link: 'https://example.test/about' },
      { context: ctx },
    )

    expect(res.comment).toMatchObject({ name: 'Alice', link: 'https://example.test/about' })
    // A first-time commenter lands in the moderation queue.
    expect(res.comment.isPending).toBe(true)
    // The row is really there, attached to the resolved metric target.
    const rows = await db.select().from(comment)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.ownerId).toBe(pid)
    expect(rows[0]?.content).toContain('hello')
    // The admin notification fired (mocked) and the ownership token
    // rides out as a Set-Cookie.
    const emails = await import('@/server/domains/comments/services/email')
    expect(emails.sendNewComment).toHaveBeenCalledTimes(1)
    expect(ctx.responseHeaders.get('Set-Cookie')).toContain('__comment_tokens=')
  })
})

describe('commentsRouter.getRaw', () => {
  it('throws BAD_REQUEST when rid is not numeric', async () => {
    const ctx = makePublicCtx({ db })
    await expect(call(commentsRouter.getRaw, { rid: 'not-a-number' }, { context: ctx })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('returns the body and refreshes the comment-token cookie on a valid token', async () => {
    const uid = await seedUser({ name: 'Alice', email: 'alice@example.com' })
    const pid = await seedPost('raw-target')
    const id = await seedComment({ userId: uid, ownerId: pid, body: validBody })
    const token = await issueCommentToken(db, id, uid, 'pk-1', 60)
    const cookie = serializeCommentTokensCookie({ 'pk-1': [{ token, expiresAt: Date.now() + 60_000 }] })
    const ctx = makePublicCtxWithCookie(cookie)

    const res = await call(commentsRouter.getRaw, { rid: String(id) }, { context: ctx })

    expect(res.body).toEqual(validBody)
    expect(ctx.responseHeaders.get('Set-Cookie')).toContain('__comment_tokens=')
  })

  it('throws FORBIDDEN without refreshing the cookie when no token matches', async () => {
    const uid = await seedUser({ name: 'Alice', email: 'alice@example.com' })
    const pid = await seedPost('raw-forbidden')
    const id = await seedComment({ userId: uid, ownerId: pid, body: validBody })
    const ctx = makePublicCtx({ db })

    await expect(call(commentsRouter.getRaw, { rid: String(id) }, { context: ctx })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(ctx.responseHeaders.get('Set-Cookie')).toBeNull()
  })
})

describe('commentsRouter.edit', () => {
  it('throws BAD_REQUEST when rid is not numeric', async () => {
    const ctx = makePublicCtx({ db })
    await expect(call(commentsRouter.edit, { rid: 'not-a-number', body: [] }, { context: ctx })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('lets an admin edit any comment body', async () => {
    const uid = await seedUser({ name: 'Alice', email: 'alice@example.com' })
    const pid = await seedPost('edit-target')
    const id = await seedComment({ userId: uid, ownerId: pid, body: validBody, content: 'hello' })
    const newBody: CommentBody = [
      {
        _type: 'block',
        _key: 'b9',
        style: 'normal',
        children: [{ _type: 'span', _key: 's9', text: 'moderated', marks: [] }],
        markDefs: [],
      },
    ]
    const ctx = makeAuthedCtx({ db, role: 'admin' })

    const res = await call(commentsRouter.edit, { rid: String(id), body: newBody }, { context: ctx })

    expect(res.comment).toMatchObject({ id: String(id) })
    const stored = await db.select().from(comment)
    expect(stored[0]?.content).toContain('moderated')
  })
})
