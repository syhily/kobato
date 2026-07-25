import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { randomUUID } from 'node:crypto'
import superjson from 'superjson'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { comment } from '@/server/infra/db/schema/comment'
import { metric } from '@/server/infra/db/schema/metric'
import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

vi.mock('@/server/domains/comments/cache', () => ({ clearLatestCommentsCache: vi.fn(async () => undefined) }))
vi.mock('@/server/domains/comments/services/email', () => ({
  sendApprovedComment: vi.fn(async () => undefined),
  sendNewComment: vi.fn(async () => undefined),
  sendNewReply: vi.fn(async () => undefined),
}))
vi.mock('@/server/domains/comments/services/canonicalize', () => ({
  canonicalizeCommentBody: vi.fn(async (input: unknown) => ({ body: input, content: 'md' })),
}))

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
})

async function seedUser(): Promise<bigint> {
  const rows = await db
    .insert(user)
    .values({ name: 'Alice', email: `alice-${Math.random()}@x.com`, password: 'p', role: 'visitor' })
    .returning({ id: user.id })
  return rows[0]!.id
}

async function seedComment(opts: Partial<typeof comment.$inferInsert> = {}): Promise<bigint> {
  const rows = await db
    .insert(comment)
    .values({
      type: 'post',
      ownerId: 1n,
      userId: 1n,
      content: 'hi',
      body: [],
      ...opts,
    })
    .returning({ id: comment.id })
  return rows[0]!.id
}

describe('comments/repos/public-query — findCommentWithUserById', () => {
  it('returns null when the comment does not exist', async () => {
    const { findCommentWithUserById } = await import('@/server/domains/comments/repos/public-query/by-id')
    expect(await findCommentWithUserById(db, 9999n)).toBeNull()
  })
  it('returns the comment with the user join', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1 })
    const { findCommentWithUserById } = await import('@/server/domains/comments/repos/public-query/by-id')
    const r = await findCommentWithUserById(db, id)
    expect(r?.name).toBe('Alice')
  })
})

describe('comments/services/moderate — approveComment', () => {
  it('flips is_pending=false and clears cache', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1, isPending: true })
    const { approveComment } = await import('@/server/domains/comments/services/moderate')
    await approveComment(db, String(id))
    const rows = await db.select({ isPending: comment.isPending }).from(comment)
    expect(rows[0]?.isPending).toBe(false)
    const { clearLatestCommentsCache } = await import('@/server/domains/comments/cache')
    expect(clearLatestCommentsCache).toHaveBeenCalled()
  })
})

describe('comments/repos/moderation — deleteCommentById', () => {
  it('hard-deletes the row', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1 })
    const { deleteCommentById } = await import('@/server/domains/comments/repos/moderation')
    await deleteCommentById(db, id)
    const rows = await db.select({ id: comment.id }).from(comment)
    expect(rows).toHaveLength(0)
  })
})

describe('comments/services/moderate — updateComment', () => {
  it('rewrites the body/content and clears cache', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1, content: 'old' })
    const { updateComment } = await import('@/server/domains/comments/services/moderate')
    const r = await updateComment(db, String(id), [])
    expect(r).not.toBeNull()
    const rows = await db.select({ content: comment.content }).from(comment)
    expect(rows[0]?.content).toBe('md')
  })
  it('returns null when the comment does not exist', async () => {
    const { updateComment } = await import('@/server/domains/comments/services/moderate')
    expect(await updateComment(db, '9999', [])).toBeNull()
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
    const r = await updateOwnComment(db, String(id), [])
    expect(r).not.toBeNull()
    const rows = await db.select({ isPending: comment.isPending }).from(comment)
    expect(rows[0]?.isPending).toBe(false)
  })
  it('re-pends and emails when editing outside the grace window', async () => {
    const u1 = await seedUser()
    const old = new Date(Date.now() - 60 * 60 * 1000)
    const id = await seedComment({ userId: u1, createdAt: old, updatedAt: old })
    const { updateOwnComment } = await import('@/server/domains/comments/services/moderate')
    const r = await updateOwnComment(db, String(id), [])
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
      .values({ slug: 'filter-post', title: 'Filtered', published: true, publishedRevisionId: 1n })
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

describe('comments/services/token — issue/verify/revoke cycle', () => {
  it('issues a token that verifies then is revoked', async () => {
    const { issueCommentToken, verifyCommentToken, revokeCommentToken } =
      await import('@/server/domains/comments/services/token')
    const tok = await issueCommentToken(db, 1n, 2n, 'post:1', 60)
    const payload = await verifyCommentToken(db, tok)
    expect(payload?.commentId).toBe('1')
    expect(payload?.userId).toBe('2')
    await revokeCommentToken(db, tok)
    expect(await verifyCommentToken(db, tok)).toBeNull()
  })
  it('returns null for an unknown token', async () => {
    const { verifyCommentToken } = await import('@/server/domains/comments/services/token')
    expect(await verifyCommentToken(db, 'does-not-exist')).toBeNull()
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
  it('accepts a real token issued by issueCommentToken (superjson wire format)', async () => {
    const { issueCommentToken, cleanupExpiredTokens } = await import('@/server/domains/comments/services/token')
    const token = await issueCommentToken(db, 42n, 7n, 'post:1', 60)
    const r = await cleanupExpiredTokens(db, {
      'post:1': [{ token, expiresAt: Date.now() + 60_000 }],
    })
    expect(r.validEntries).toHaveLength(1)
    expect(r.validEntries[0]?.payload.commentId).toBe('42')
    expect(r.cleaned['post:1']).toHaveLength(1)
  })
  it('skips entries whose stored payload is not a superjson envelope', async () => {
    const { cleanupExpiredTokens } = await import('@/server/domains/comments/services/token')
    const token = 'bad-json-' + Math.random().toString(36).slice(2)
    // The jsonb column accepts a bare JSON string; the envelope guard
    // (`isRecord + 'json' in`) reads it as a miss.
    await db.insert(oneTimeToken).values({
      key: `comment:token:${token}`,
      payload: 'not-an-envelope',
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
      payload: superjson.serialize({ foo: 'bar' }),
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
    const token = await issueCommentToken(db, 77n, 7n, 'post:1', 60)
    const r = await verifyCommentOwnership(db, { 'post:1': [{ token, expiresAt: Date.now() + 60_000 }] }, '77')
    expect(r.token).toBe(token)
  })
  it('returns token=null when the backed token does not match the commentId', async () => {
    const { issueCommentToken, verifyCommentOwnership } = await import('@/server/domains/comments/services/token')
    const token = await issueCommentToken(db, 111n, 7n, 'post:1', 60)
    const r = await verifyCommentOwnership(db, { 'post:1': [{ token, expiresAt: Date.now() + 60_000 }] }, '222')
    expect(r.token).toBeNull()
  })
})

describe('comments/services/access — verifyCommentAccess', () => {
  it('short-circuits with ok=true for an admin session', async () => {
    const { verifyCommentAccess } = await import('@/server/domains/comments/services/access')
    const r = await verifyCommentAccess(db, {}, '1', { id: '1', role: 'admin' })
    expect(r.ok).toBe(true)
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
})
