import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommentBody } from '@/shared/pt/comment-schema'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { comment } from '@/server/infra/db/schema/comment'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { metric } from '@/server/infra/db/schema/metric'
import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

// Everything runs against the real engine (canonicalize pipeline, kv_cache
// invalidation); only the outbound email stays mocked.
vi.mock('@/server/domains/comments/services/email', () => ({
  sendApprovedComment: vi.fn(async () => undefined),
  sendNewComment: vi.fn(async () => undefined),
  sendNewReply: vi.fn(async () => undefined),
}))

const { canonicalizeCommentBody } = await import('@/server/domains/comments/services/canonicalize')

const db = getTestDb()

const NEW_BODY: CommentBody = [
  {
    _type: 'block',
    _key: 'b2',
    style: 'normal',
    children: [{ _type: 'span', _key: 's2', text: 'edited', marks: [] }],
    markDefs: [],
  },
]

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
})

async function seedUser(): Promise<number> {
  const rows = await db
    .insert(user)
    .values({ name: 'Alice', email: `alice-${Math.random()}@x.com`, password: 'p', role: 'visitor' })
    .returning({ id: user.id })
  return rows[0]!.id
}

async function seedComment(opts: Partial<typeof comment.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(comment)
    .values({
      type: 'post',
      ownerId: 1,
      userId: 1,
      content: 'hi',
      body: [],
      ...opts,
    })
    .returning({ id: comment.id })
  return rows[0]!.id
}

describe('comments/services/lookup — findCommentWithUserById', () => {
  it('returns null when the comment does not exist', async () => {
    const { findCommentWithUserById } = await import('@/server/domains/comments/services/lookup')
    expect(await findCommentWithUserById(db, 9999)).toBeNull()
  })
  it('returns the comment with the user join', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1 })
    const { findCommentWithUserById } = await import('@/server/domains/comments/services/lookup')
    const r = await findCommentWithUserById(db, id)
    expect(r?.name).toBe('Alice')
  })
})

describe('comments/services/moderate — approveComment', () => {
  it('flips is_pending=false and clears the comments cache bucket', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1, isPending: true })
    // Pre-seed the bucket the invalidation must clear, plus a surviving control row.
    await db
      .insert(kvCache)
      .values({ key: 'comments:latest', bucket: 'comments', value: [], blob: null, expiresAt: null })
    await db.insert(kvCache).values({ key: 'feed:all', bucket: 'feed', value: {}, blob: null, expiresAt: null })

    const { approveComment } = await import('@/server/domains/comments/services/moderate')
    await approveComment(db, String(id))

    const rows = await db.select({ isPending: comment.isPending }).from(comment)
    expect(rows[0]?.isPending).toBe(false)
    expect(await db.select().from(kvCache).where(eq(kvCache.bucket, 'comments'))).toHaveLength(0)
    expect(await db.select().from(kvCache).where(eq(kvCache.bucket, 'feed'))).toHaveLength(1)
  })
})

describe('comments/services/moderate — deleteCommentById', () => {
  it('hard-deletes the row', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1 })
    const { deleteCommentById } = await import('@/server/domains/comments/services/moderate')
    await deleteCommentById(db, id)
    const rows = await db.select({ id: comment.id }).from(comment)
    expect(rows).toHaveLength(0)
  })
})

describe('comments/services/moderate — updateComment', () => {
  it('rewrites the body/content through the real canonicalize pipeline', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1, content: 'old' })
    const expected = await canonicalizeCommentBody(NEW_BODY)
    const { updateComment } = await import('@/server/domains/comments/services/moderate')
    const r = await updateComment(db, String(id), NEW_BODY)
    expect(r).not.toBeNull()
    const rows = await db.select({ content: comment.content, body: comment.body }).from(comment)
    expect(rows[0]?.content).toBe(expected.content)
    expect(rows[0]?.body).toEqual(expected.body)
  })
  it('returns null when the comment does not exist', async () => {
    const { updateComment } = await import('@/server/domains/comments/services/moderate')
    expect(await updateComment(db, '9999', NEW_BODY)).toBeNull()
  })
})

describe('comments/services/moderate — updateOwnComment', () => {
  it('returns null when the comment does not exist', async () => {
    const { updateOwnComment } = await import('@/server/domains/comments/services/moderate')
    expect(await updateOwnComment(db, '9999', [])).toBeNull()
  })
  it('edits inside the grace window without re-pending', async () => {
    const u1 = await seedUser()
    const now = new Date()
    const id = await seedComment({ userId: u1, updatedAt: now, createdAt: now })
    const { updateOwnComment } = await import('@/server/domains/comments/services/moderate')
    const r = await updateOwnComment(db, String(id), NEW_BODY)
    expect(r).not.toBeNull()
    const rows = await db.select({ isPending: comment.isPending }).from(comment)
    expect(rows[0]?.isPending).toBe(false)
  })
  it('re-pends and emails when editing outside the grace window', async () => {
    const u1 = await seedUser()
    const old = new Date(Date.now() - 60 * 60 * 1000)
    const id = await seedComment({ userId: u1, createdAt: old, updatedAt: old })
    const { updateOwnComment } = await import('@/server/domains/comments/services/moderate')
    const r = await updateOwnComment(db, String(id), NEW_BODY)
    expect(r).not.toBeNull()
    const rows = await db.select({ isPending: comment.isPending }).from(comment)
    expect(rows[0]?.isPending).toBe(true)
    const { sendNewComment } = await import('@/server/domains/comments/services/email')
    expect(sendNewComment).toHaveBeenCalled()
  })
})

describe('comments/services/admin-query — loadAdminPendingDashboard', () => {
  it('returns empty items + zero counts on an empty table', async () => {
    const { loadAdminPendingDashboard } = await import('@/server/domains/comments/services/admin-query')
    const r = await loadAdminPendingDashboard(db, 'all', 0, 10)
    expect(r.items).toEqual([])
    expect(r.total).toBe(0)
    expect(r.counts).toEqual({ all: 0, approval: 0, deletion: 0 })
  })
  it('returns a pending approval item', async () => {
    const u1 = await seedUser()
    await seedComment({ userId: u1, isPending: true })
    const { loadAdminPendingDashboard } = await import('@/server/domains/comments/services/admin-query')
    const r = await loadAdminPendingDashboard(db, 'approval', 0, 10)
    expect(r.items).toHaveLength(1)
    expect(r.items[0]?.kind).toBe('approval')
    expect(r.total).toBe(1)
  })
})

describe('comments/services/admin-query — loadAllComments', () => {
  it('returns empty page when status filter yields nothing', async () => {
    const { loadAllComments } = await import('@/server/domains/comments/services/admin-query')
    const r = await loadAllComments(db, { offset: 0, limit: 10, status: 'pending' })
    expect(r.total).toBe(0)
    expect(r.hasMore).toBe(false)
    expect(r.statusCounts).toEqual({ all: 0, pending: 0, approved: 0, deleteRequested: 0 })
  })
  it('returns rows + statusCounts', async () => {
    const u1 = await seedUser()
    await seedComment({ userId: u1, isPending: false })
    await seedComment({ userId: u1, isPending: true })
    const { loadAllComments } = await import('@/server/domains/comments/services/admin-query')
    const r = await loadAllComments(db, { offset: 0, limit: 10, status: 'all' })
    expect(r.total).toBe(2)
    expect(r.comments).toHaveLength(2)
  })
  it('returns empty result when filterPublicId matches no metric', async () => {
    const { loadAllComments } = await import('@/server/domains/comments/services/admin-query')
    const r = await loadAllComments(db, { offset: 0, limit: 10, filterPublicId: randomUUID() })
    expect(r.total).toBe(0)
    expect(r.comments).toEqual([])
  })
  it('returns comments filtered by a resolved publicId', async () => {
    const u1 = await seedUser()
    const pid = await db
      .insert(post)
      .values({ slug: 'filter-post', title: 'Filtered', published: true, publishedRevisionId: 1 })
      .returning({ id: post.id })
    const pubId = randomUUID()
    await db.insert(metric).values({ type: 'post', ownerId: pid[0]!.id, publicId: pubId })
    await seedComment({ userId: u1, ownerId: pid[0]!.id })
    const { loadAllComments } = await import('@/server/domains/comments/services/admin-query')
    const r = await loadAllComments(db, { offset: 0, limit: 10, filterPublicId: pubId })
    expect(r.total).toBe(1)
    expect(r.comments[0]?.pageTitle).toBe('Filtered')
  })
})

describe('comments/services/admin-query — searchPageOptions / searchAuthorOptions', () => {
  it('delegates to the underlying repo functions', async () => {
    const { searchPageOptions, searchAuthorOptions } = await import('@/server/domains/comments/services/admin-query')
    expect(await searchPageOptions(db, undefined, 10)).toEqual([])
    expect(await searchAuthorOptions(db, undefined, 10)).toEqual([])
  })
})

describe('comments/services/token — issue/revoke cycle', () => {
  it('issues a token that cleanupExpiredTokens accepts, then is revoked', async () => {
    const { issueCommentToken, cleanupExpiredTokens, revokeCommentToken } =
      await import('@/server/domains/comments/services/token')
    const tok = await issueCommentToken(db, 1, 2, 'post:1', 60)
    const cookie = { 'post:1': [{ token: tok, expiresAt: Date.now() + 60_000 }] }

    const before = await cleanupExpiredTokens(db, cookie)
    expect(before.validEntries[0]?.payload.commentId).toBe('1')
    expect(before.validEntries[0]?.payload.userId).toBe('2')

    await revokeCommentToken(db, tok)
    const after = await cleanupExpiredTokens(db, cookie)
    expect(after.validEntries).toEqual([])
  })
})

describe('comments/services/token — appendCommentToken', () => {
  it('adds a new entry to the per-pageKey list', async () => {
    const { appendCommentToken } = await import('@/server/domains/comments/services/token')
    const out = appendCommentToken({}, 'post:1', 'tok', 60)
    expect(out['post:1']).toHaveLength(1)
    expect(out['post:1']?.[0]).toMatchObject({ token: 'tok' })
  })
  it('appends to an existing list without mutating the input', async () => {
    const { appendCommentToken } = await import('@/server/domains/comments/services/token')
    const before = appendCommentToken({}, 'post:1', 'tok1', 60)
    const after = appendCommentToken(before, 'post:1', 'tok2', 60)
    expect(after['post:1']).toHaveLength(2)
  })
})

describe('comments/services/token — cleanupExpiredTokens', () => {
  it('returns empty result when the cookie is empty', async () => {
    const { cleanupExpiredTokens } = await import('@/server/domains/comments/services/token')
    const r = await cleanupExpiredTokens(db, {})
    expect(r.cleaned).toEqual({})
    expect(r.validEntries).toEqual([])
  })
  it('skips entries whose local expiresAt has already passed', async () => {
    const { cleanupExpiredTokens } = await import('@/server/domains/comments/services/token')
    const r = await cleanupExpiredTokens(db, {
      'post:1': [{ token: 'expired', expiresAt: Date.now() - 1000 }],
    })
    expect(r.cleaned).toEqual({})
    expect(r.validEntries).toEqual([])
  })
  it('accepts a real token issued by issueCommentToken (plain-JSON wire format)', async () => {
    const { issueCommentToken, cleanupExpiredTokens } = await import('@/server/domains/comments/services/token')
    const token = await issueCommentToken(db, 42, 7, 'post:1', 60)
    const r = await cleanupExpiredTokens(db, {
      'post:1': [{ token, expiresAt: Date.now() + 60_000 }],
    })
    expect(r.validEntries).toHaveLength(1)
    expect(r.validEntries[0]?.payload.commentId).toBe('42')
    expect(r.cleaned['post:1']).toHaveLength(1)
  })
  it('skips entries whose stored payload is not a payload object', async () => {
    const { cleanupExpiredTokens } = await import('@/server/domains/comments/services/token')
    const token = 'bad-json-' + Math.random().toString(36).slice(2)
    // The json column accepts a bare JSON string; the shape guard reads it as a miss.
    await db.insert(oneTimeToken).values({
      key: `comment:token:${token}`,
      payload: 'not-a-payload-object',
      expiresAt: new Date(Date.now() + 60_000),
    })
    const r = await cleanupExpiredTokens(db, {
      'post:1': [{ token, expiresAt: Date.now() + 60_000 }],
    })
    expect(r.validEntries).toEqual([])
    expect(r.cleaned).toEqual({})
  })
  it('skips entries whose stored payload fails the shape guard', async () => {
    const { cleanupExpiredTokens } = await import('@/server/domains/comments/services/token')
    const token = 'bad-shape-' + Math.random().toString(36).slice(2)
    await db.insert(oneTimeToken).values({
      key: `comment:token:${token}`,
      payload: { foo: 'bar' },
      expiresAt: new Date(Date.now() + 60_000),
    })
    const r = await cleanupExpiredTokens(db, {
      'post:1': [{ token, expiresAt: Date.now() + 60_000 }],
    })
    expect(r.validEntries).toEqual([])
  })
})

describe('comments/services/token — verifyCommentOwnership', () => {
  it('returns token=null when no token list is supplied', async () => {
    const { verifyCommentOwnership } = await import('@/server/domains/comments/services/token')
    const r = await verifyCommentOwnership(db, {}, '7')
    expect(r.token).toBeNull()
  })
  it('returns the matched token when a backed token matches the commentId', async () => {
    const { issueCommentToken, verifyCommentOwnership } = await import('@/server/domains/comments/services/token')
    const token = await issueCommentToken(db, 77, 7, 'post:1', 60)
    const r = await verifyCommentOwnership(db, { 'post:1': [{ token, expiresAt: Date.now() + 60_000 }] }, '77')
    expect(r.token).toBe(token)
  })
  it('returns token=null when the backed token does not match the commentId', async () => {
    const { issueCommentToken, verifyCommentOwnership } = await import('@/server/domains/comments/services/token')
    const token = await issueCommentToken(db, 111, 7, 'post:1', 60)
    const r = await verifyCommentOwnership(db, { 'post:1': [{ token, expiresAt: Date.now() + 60_000 }] }, '222')
    expect(r.token).toBeNull()
  })
})

describe('comments/services/access — verifyCommentAccess', () => {
  it('short-circuits with ok=true for an admin session, no token rows needed', async () => {
    // Admin bypass: access is granted with an empty token jar.
    const { verifyCommentAccess } = await import('@/server/domains/comments/services/access')
    const r = await verifyCommentAccess(db, {}, '1', { id: '1', role: 'admin' })
    expect(r.ok).toBe(true)
    expect(r.cleaned).toEqual({})
  })
  it('returns ok=true with the cleaned cookie when a real token proves ownership', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1 })
    const { issueCommentToken, appendCommentToken } = await import('@/server/domains/comments/services/token')
    const { verifyCommentAccess } = await import('@/server/domains/comments/services/access')
    const token = await issueCommentToken(db, id, u1, 'post:1', 60)
    // A second, un-backed entry must be dropped by the cleanup passthrough.
    const cookie = appendCommentToken(appendCommentToken({}, 'post:9', 'ghost-token', 60), 'post:1', token, 60)

    const r = await verifyCommentAccess(db, cookie, String(id))

    expect(r.ok).toBe(true)
    expect(r.cleaned['post:1']?.[0]?.token).toBe(token)
    expect(r.cleaned['post:9']).toBeUndefined()
  })
  it('returns ok=false when no token and no session ownership', async () => {
    const { verifyCommentAccess } = await import('@/server/domains/comments/services/access')
    const r = await verifyCommentAccess(db, {}, '9999')
    expect(r.ok).toBe(false)
  })
  it('returns ok=true when the session user matches the comment author', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1 })
    const { verifyCommentAccess } = await import('@/server/domains/comments/services/access')
    const r = await verifyCommentAccess(db, {}, String(id), { id: String(u1), role: 'visitor' })
    expect(r.ok).toBe(true)
  })
  it('returns ok=false when the session user does not own the comment', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1 })
    const { verifyCommentAccess } = await import('@/server/domains/comments/services/access')
    const r = await verifyCommentAccess(db, {}, String(id), { id: '99999', role: 'visitor' })
    expect(r.ok).toBe(false)
  })
  it('returns ok=false when the comment does not exist for the session user', async () => {
    const { verifyCommentAccess } = await import('@/server/domains/comments/services/access')
    const r = await verifyCommentAccess(db, {}, '9999', { id: '42', role: 'visitor' })
    expect(r.ok).toBe(false)
  })
})
