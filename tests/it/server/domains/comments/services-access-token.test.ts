import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { comment } from '@/server/infra/db/schema/comment'
import { metric } from '@/server/infra/db/schema/metric'
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
  await flushWorkerRedis()
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

describe('comments/services/moderate — getCommentById', () => {
  it('returns null when the comment does not exist', async () => {
    const { getCommentById } = await import('@/server/domains/comments/services/moderate')
    expect(await getCommentById(db, '9999')).toBeNull()
  })
  it('returns the comment with the user join', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1 })
    const { getCommentById } = await import('@/server/domains/comments/services/moderate')
    const r = await getCommentById(db, String(id))
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

describe('comments/services/moderate — deleteComment', () => {
  it('hard-deletes the row', async () => {
    const u1 = await seedUser()
    const id = await seedComment({ userId: u1 })
    const { deleteComment } = await import('@/server/domains/comments/services/moderate')
    await deleteComment(db, String(id))
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
    const tok = await issueCommentToken(1n, 2n, 'post:1', 60)
    const payload = await verifyCommentToken(tok)
    expect(payload?.commentId).toBe('1')
    expect(payload?.userId).toBe('2')
    await revokeCommentToken(tok)
    expect(await verifyCommentToken(tok)).toBeNull()
  })
  it('returns null for an unknown token', async () => {
    const { verifyCommentToken } = await import('@/server/domains/comments/services/token')
    expect(await verifyCommentToken('does-not-exist')).toBeNull()
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
    const r = await cleanupExpiredTokens({})
    expect(r.cleaned).toEqual({})
    expect(r.validEntries).toEqual([])
  })
  it('skips entries whose local expiresAt has already passed', async () => {
    const { cleanupExpiredTokens } = await import('@/server/domains/comments/services/token')
    const r = await cleanupExpiredTokens({
      'post:1': [{ token: 'expired', expiresAt: Date.now() - 1000 }],
    })
    expect(r.cleaned).toEqual({})
    expect(r.validEntries).toEqual([])
  })
  it('keeps entries backed by a valid JSON payload in Redis', async () => {
    const { redisInstance } = await import('@/server/infra/redis/storage')
    const { cleanupExpiredTokens } = await import('@/server/domains/comments/services/token')
    const redis = redisInstance()
    const token = 'manual-token-' + Math.random().toString(36).slice(2)
    const payload = JSON.stringify({
      commentId: '42',
      userId: '7',
      pageKey: 'post:1',
      createdAt: Date.now(),
    })
    await redis.set(`comment:token:${token}`, payload, 'EX', 60)
    const r = await cleanupExpiredTokens({
      'post:1': [{ token, expiresAt: Date.now() + 60_000 }],
    })
    expect(r.validEntries).toHaveLength(1)
    expect(r.validEntries[0]?.payload.commentId).toBe('42')
    expect(r.cleaned['post:1']).toHaveLength(1)
    await redis.del(`comment:token:${token}`)
  })
  it('skips entries whose Redis payload is not valid JSON', async () => {
    const { redisInstance } = await import('@/server/infra/redis/storage')
    const { cleanupExpiredTokens } = await import('@/server/domains/comments/services/token')
    const redis = redisInstance()
    const token = 'bad-json-' + Math.random().toString(36).slice(2)
    await redis.set(`comment:token:${token}`, 'not-json', 'EX', 60)
    const r = await cleanupExpiredTokens({
      'post:1': [{ token, expiresAt: Date.now() + 60_000 }],
    })
    expect(r.validEntries).toEqual([])
    expect(r.cleaned).toEqual({})
    await redis.del(`comment:token:${token}`)
  })
  it('skips entries whose Redis payload fails the shape guard', async () => {
    const { redisInstance } = await import('@/server/infra/redis/storage')
    const { cleanupExpiredTokens } = await import('@/server/domains/comments/services/token')
    const redis = redisInstance()
    const token = 'bad-shape-' + Math.random().toString(36).slice(2)
    await redis.set(`comment:token:${token}`, JSON.stringify({ foo: 'bar' }), 'EX', 60)
    const r = await cleanupExpiredTokens({
      'post:1': [{ token, expiresAt: Date.now() + 60_000 }],
    })
    expect(r.validEntries).toEqual([])
    await redis.del(`comment:token:${token}`)
  })
})

describe('comments/services/token — verifyCommentOwnership', () => {
  it('returns ok=false when no token list is supplied', async () => {
    const { verifyCommentOwnership } = await import('@/server/domains/comments/services/token')
    const r = await verifyCommentOwnership({}, '7')
    expect(r.ok).toBe(false)
  })
  it('returns ok=true when a backed token matches the commentId', async () => {
    const { redisInstance } = await import('@/server/infra/redis/storage')
    const { verifyCommentOwnership } = await import('@/server/domains/comments/services/token')
    const redis = redisInstance()
    const token = 'own-' + Math.random().toString(36).slice(2)
    const payload = JSON.stringify({
      commentId: '77',
      userId: '7',
      pageKey: 'post:1',
      createdAt: Date.now(),
    })
    await redis.set(`comment:token:${token}`, payload, 'EX', 60)
    const r = await verifyCommentOwnership({ 'post:1': [{ token, expiresAt: Date.now() + 60_000 }] }, '77')
    expect(r.ok).toBe(true)
    await redis.del(`comment:token:${token}`)
  })
  it('returns ok=false when the backed token does not match the commentId', async () => {
    const { redisInstance } = await import('@/server/infra/redis/storage')
    const { verifyCommentOwnership } = await import('@/server/domains/comments/services/token')
    const redis = redisInstance()
    const token = 'other-' + Math.random().toString(36).slice(2)
    const payload = JSON.stringify({
      commentId: '111',
      userId: '7',
      pageKey: 'post:1',
      createdAt: Date.now(),
    })
    await redis.set(`comment:token:${token}`, payload, 'EX', 60)
    const r = await verifyCommentOwnership({ 'post:1': [{ token, expiresAt: Date.now() + 60_000 }] }, '222')
    expect(r.ok).toBe(false)
    await redis.del(`comment:token:${token}`)
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
