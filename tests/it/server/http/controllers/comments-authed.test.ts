import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { flushAuditLog } from '@/server/domains/audit/repos/batcher'
import { commentsAuthedRouter } from '@/server/http/controllers/comments-authed.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { comment } from '@/server/infra/db/schema/comment'
import { auditLog } from '@/server/infra/db/schema/config'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedVisitor(opts: Partial<typeof user.$inferInsert> = {}): Promise<bigint> {
  const rows = await db
    .insert(user)
    .values({
      name: opts.name ?? 'Alice',
      email: opts.email ?? `alice-${Date.now()}-${Math.random()}@example.com`,
      password: 'hashed',
      role: 'visitor',
      ...opts,
    })
    .returning({ id: user.id })
  return rows[0]!.id
}

async function seedPost(title: string, slug: string): Promise<bigint> {
  const rows = await db
    .insert(post)
    .values({
      slug,
      title,
      summary: '',
      published: true,
      publishedRevisionId: 1n,
    })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function seedPage(title: string, slug: string): Promise<bigint> {
  const rows = await db.insert(page).values({ slug, title }).returning({ id: page.id })
  return rows[0]!.id
}

async function seedComment(opts: Partial<typeof comment.$inferInsert> = {}): Promise<bigint> {
  const rows = await db
    .insert(comment)
    .values({
      type: opts.type ?? 'post',
      ownerId: opts.ownerId ?? 1n,
      userId: opts.userId ?? 1n,
      content: opts.content ?? 'hello',
      body: opts.body ?? [],
      rid: opts.rid ?? 0,
      rootId: opts.rootId ?? 0n,
      isPending: opts.isPending ?? false,
      ...opts,
    })
    .returning({ id: comment.id })
  return rows[0]!.id
}

function ctxFor(userId: bigint) {
  return makeAuthedCtx({ userId: String(userId), role: 'visitor', db, pool })
}

describe('commentsAuthedRouter.searchMineEntities', () => {
  it('returns entities the user has commented on', async () => {
    const u = await seedVisitor({ name: 'U1', email: 'u1@x.com' })
    const pid = await seedPost('Matched Post Title', 'post-1')
    await seedComment({ userId: u, ownerId: pid, type: 'post', content: 'nice' })

    const res = await call(commentsAuthedRouter.searchMineEntities, {}, { context: ctxFor(u) })
    expect(res.entities).toHaveLength(1)
    expect(res.entities[0]).toEqual({ value: `post:${pid}`, label: 'Matched Post Title' })
  })

  it('filters entities by title query', async () => {
    const u = await seedVisitor({ name: 'U2', email: 'u2@x.com' })
    const pid1 = await seedPost('Alpha Article', 'post-a')
    const pid2 = await seedPost('Beta Article', 'post-b')
    await seedComment({ userId: u, ownerId: pid1, type: 'post' })
    await seedComment({ userId: u, ownerId: pid2, type: 'post' })

    const res = await call(commentsAuthedRouter.searchMineEntities, { q: 'beta' }, { context: ctxFor(u) })
    expect(res.entities).toHaveLength(1)
    expect(res.entities[0]!.label).toBe('Beta Article')
  })

  it('includes pages as well as posts', async () => {
    const u = await seedVisitor({ name: 'U3', email: 'u3@x.com' })
    const pageId = await seedPage('About Page', 'about')
    await seedComment({ userId: u, ownerId: pageId, type: 'page' })

    const res = await call(commentsAuthedRouter.searchMineEntities, {}, { context: ctxFor(u) })
    expect(res.entities).toHaveLength(1)
    expect(res.entities[0]!.value).toBe(`page:${pageId}`)
  })

  it('returns an empty list when the user has not commented on anything', async () => {
    const u = await seedVisitor({ name: 'U4', email: 'u4@x.com' })
    const res = await call(commentsAuthedRouter.searchMineEntities, {}, { context: ctxFor(u) })
    expect(res.entities).toEqual([])
  })
})

describe('commentsAuthedRouter — delete-request audit events', () => {
  beforeEach(() => {
    initAllBatchers(pool, db)
  })

  afterEach(() => {
    resetAllBatchers()
  })

  async function auditRowsFor(action: string) {
    await flushAuditLog()
    return db.select().from(auditLog).where(eq(auditLog.action, action))
  }

  it('records comment_delete_requested when the owner requests deletion', async () => {
    const u = await seedVisitor({ name: 'U7', email: 'u7@x.com' })
    const pid = await seedPost('Delete Audit Post', 'delete-audit-post')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    const res = await call(commentsAuthedRouter.requestDeleteOwn, { commentId: String(cid) }, { context: ctxFor(u) })
    expect(res.comment.id).toBe(String(cid))
    expect(res.comment.deleteRequestedAt).not.toBeNull()

    const rows = await auditRowsFor('comment_delete_requested')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('comment')
    expect(rows[0]!.resourceId).toBe(String(cid))
    expect(rows[0]!.actorId).toBe(u)
  })

  it('does not record a duplicate event on the idempotent no-op path', async () => {
    const u = await seedVisitor({ name: 'U8', email: 'u8@x.com' })
    const pid = await seedPost('Delete Audit Twice', 'delete-audit-twice')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    await call(commentsAuthedRouter.requestDeleteOwn, { commentId: String(cid) }, { context: ctxFor(u) })
    const res = await call(commentsAuthedRouter.requestDeleteOwn, { commentId: String(cid) }, { context: ctxFor(u) })
    expect(res.comment.deleteRequestedAt).not.toBeNull()

    const rows = await auditRowsFor('comment_delete_requested')
    expect(rows).toHaveLength(1)
  })

  it('records comment_delete_request_cancelled when the owner cancels the request', async () => {
    const u = await seedVisitor({ name: 'U9', email: 'u9@x.com' })
    const pid = await seedPost('Cancel Audit Post', 'cancel-audit-post')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    await call(commentsAuthedRouter.requestDeleteOwn, { commentId: String(cid) }, { context: ctxFor(u) })
    const res = await call(commentsAuthedRouter.cancelDeleteOwn, { commentId: String(cid) }, { context: ctxFor(u) })
    expect(res.comment.id).toBe(String(cid))
    expect(res.comment.deleteRequestedAt).toBeNull()

    const rows = await auditRowsFor('comment_delete_request_cancelled')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('comment')
    expect(rows[0]!.resourceId).toBe(String(cid))
    expect(rows[0]!.actorId).toBe(u)
  })
})

describe('commentsAuthedRouter.updateOwn', () => {
  beforeEach(() => {
    initAllBatchers(pool, db)
  })

  afterEach(() => {
    resetAllBatchers()
  })

  it('returns the updated wire comment', async () => {
    const u = await seedVisitor({ name: 'U10', email: 'u10@x.com' })
    const pid = await seedPost('Own Edit Post', 'own-edit-post')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    const body = [
      {
        _type: 'block' as const,
        _key: 'b1',
        style: 'normal' as const,
        children: [{ _type: 'span' as const, _key: 's1', text: 'edited body' }],
      },
    ]
    const res = await call(commentsAuthedRouter.updateOwn, { commentId: String(cid), body }, { context: ctxFor(u) })

    expect(res.comment.id).toBe(String(cid))
    expect(res.comment.userId).toBe(String(u))
    expect(JSON.stringify(res.comment.body)).toContain('edited body')
  })
})

describe('commentsAuthedRouter.loadMine', () => {
  it('filters by entity when `entity` is supplied', async () => {
    const u = await seedVisitor({ name: 'U5', email: 'u5@x.com' })
    const pid1 = await seedPost('Post One', 'post-one')
    const pid2 = await seedPost('Post Two', 'post-two')
    await seedComment({ userId: u, ownerId: pid1, type: 'post', content: 'on one' })
    await seedComment({ userId: u, ownerId: pid2, type: 'post', content: 'on two' })

    const res = await call(commentsAuthedRouter.loadMine, { entity: `post:${pid1}` }, { context: ctxFor(u) })
    expect(res.items).toHaveLength(1)
    expect(res.total).toBe(1)
  })

  it('ignores an invalid `entity` parameter', async () => {
    const u = await seedVisitor({ name: 'U6', email: 'u6@x.com' })
    const pid = await seedPost('Post Three', 'post-three')
    await seedComment({ userId: u, ownerId: pid, type: 'post' })

    const res = await call(commentsAuthedRouter.loadMine, { entity: 'bad-value' }, { context: ctxFor(u) })
    expect(res.items).toHaveLength(1)
    expect(res.total).toBe(1)
  })
})
