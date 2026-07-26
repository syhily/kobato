import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { editOwnComment, resolveCommentDeleteRequest } from '@/server/domains/comments/services/moderate'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { comment } from '@/server/infra/db/schema/comment'
import { auditLog } from '@/server/infra/db/schema/config'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

// Domain-seam coverage for the two moderation flows sunk out of the HTTP
// controllers (task C4):
//
//   * `editOwnComment` — the update-own-comment flow: ownership check,
//     delete-request fence, has-replies edit lock, then the grace-window
//     mutation (pinned separately in `update-own-comment.test.ts`);
//   * `resolveCommentDeleteRequest` — the admin delete-request state
//     machine: existence fence, pending-request fence, approve →
//     soft-delete / reject → clear, each branch auditing its own event.
//
// The error codes and Chinese messages asserted here are the wire
// contract — the controllers used to throw them inline as `ORPCError`s
// and the oRPC `domainErrorGuard` now translates these `DomainError`s
// into the byte-identical wire shape.

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(pool, db)
})

afterEach(() => {
  resetAllBatchers()
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

async function seedAdmin(opts: Partial<typeof user.$inferInsert> = {}): Promise<bigint> {
  // The audit row's actor_id FK requires a real user row — a synthetic id
  // would silently dead-letter the batched insert.
  return seedVisitor({
    name: 'Admin',
    email: `admin-${Date.now()}-${Math.random()}@example.com`,
    role: 'admin',
    ...opts,
  })
}

function adminCtxFor(adminId: bigint) {
  return makeAuthedCtx({ userId: String(adminId), role: 'admin', db, pool })
}

const EDITED_BODY = [
  {
    _type: 'block' as const,
    _key: 'b1',
    style: 'normal' as const,
    children: [{ _type: 'span' as const, _key: 's1', text: 'edited body' }],
  },
]

async function auditRowsFor(action: string) {
  await flushAuditLog()
  return db.select().from(auditLog).where(eq(auditLog.action, action))
}

describe('editOwnComment — update-own flow with the reply edit lock', () => {
  it('edits the owned comment and audits comment_own_updated', async () => {
    const u = await seedVisitor({ name: 'U1', email: 'u1@x.com' })
    const pid = await seedPost('Edit Flow Post', 'edit-flow-post')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    const ctx = ctxFor(u)
    const updated = await editOwnComment(db, String(cid), EDITED_BODY, ctx.viewer!, ctx)

    expect(updated.id).toBe(cid)
    expect(JSON.stringify(updated.body)).toContain('edited body')

    const rows = await auditRowsFor('comment_own_updated')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('comment')
    expect(rows[0]!.resourceId).toBe(String(cid))
    expect(rows[0]!.actorId).toBe(u)
  })

  it('rejects with NOT_FOUND when the comment belongs to somebody else', async () => {
    const owner = await seedVisitor({ name: 'U2', email: 'u2@x.com' })
    const stranger = await seedVisitor({ name: 'U3', email: 'u3@x.com' })
    const pid = await seedPost('Foreign Edit Post', 'foreign-edit-post')
    const cid = await seedComment({ userId: owner, ownerId: pid, type: 'post' })

    const ctx = ctxFor(stranger)
    await expect(editOwnComment(db, String(cid), EDITED_BODY, ctx.viewer!, ctx)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '资源不存在。',
    })
  })

  it('rejects with CONFLICT when a delete request is pending', async () => {
    const u = await seedVisitor({ name: 'U4', email: 'u4@x.com' })
    const pid = await seedPost('Delete Requested Edit', 'delete-requested-edit')
    const cid = await seedComment({
      userId: u,
      ownerId: pid,
      type: 'post',
      deleteRequestedAt: new Date(),
      deleteRequestedBy: u,
    })

    const ctx = ctxFor(u)
    await expect(editOwnComment(db, String(cid), EDITED_BODY, ctx.viewer!, ctx)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: '已申请删除，无法编辑。',
    })
  })

  it('rejects with CONFLICT once an approved reply exists (the edit lock)', async () => {
    const u = await seedVisitor({ name: 'U5', email: 'u5@x.com' })
    const pid = await seedPost('Replied Edit Post', 'replied-edit-post')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })
    await seedComment({ userId: u, ownerId: pid, type: 'post', rid: Number(cid), rootId: cid, isPending: false })

    const ctx = ctxFor(u)
    await expect(editOwnComment(db, String(cid), EDITED_BODY, ctx.viewer!, ctx)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: '已有回复，无法再编辑。',
    })

    // The lock fired before any write: the body is untouched and no audit
    // event was recorded.
    const [row] = await db.select().from(comment).where(eq(comment.id, cid))
    expect(row!.content).toBe('hello')
    expect(await auditRowsFor('comment_own_updated')).toHaveLength(0)
  })

  it('still allows the edit when the only replies are pending or deleted', async () => {
    const u = await seedVisitor({ name: 'U6', email: 'u6@x.com' })
    const pid = await seedPost('Pending Reply Edit', 'pending-reply-edit')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })
    await seedComment({ userId: u, ownerId: pid, type: 'post', rid: Number(cid), rootId: cid, isPending: true })
    await seedComment({
      userId: u,
      ownerId: pid,
      type: 'post',
      rid: Number(cid),
      rootId: cid,
      isPending: false,
      deletedAt: new Date(),
    })

    const ctx = ctxFor(u)
    const updated = await editOwnComment(db, String(cid), EDITED_BODY, ctx.viewer!, ctx)
    expect(JSON.stringify(updated.body)).toContain('edited body')
  })
})

describe('resolveCommentDeleteRequest — admin delete-request state machine', () => {
  it('approve soft-deletes the comment and audits comment_delete_request_approved', async () => {
    const u = await seedVisitor({ name: 'U7', email: 'u7@x.com' })
    const pid = await seedPost('Approve Deletion Post', 'approve-deletion-post')
    const cid = await seedComment({
      userId: u,
      ownerId: pid,
      type: 'post',
      deleteRequestedAt: new Date(),
      deleteRequestedBy: u,
    })

    const admin = await seedAdmin()
    await resolveCommentDeleteRequest(db, String(cid), true, adminCtxFor(admin))

    const [row] = await db.select().from(comment).where(eq(comment.id, cid))
    expect(row!.deletedAt).not.toBeNull()
    expect(row!.deleteRequestedAt).not.toBeNull()

    const rows = await auditRowsFor('comment_delete_request_approved')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('comment')
    expect(rows[0]!.resourceId).toBe(String(cid))
  })

  it('reject clears the delete request and audits comment_delete_request_rejected', async () => {
    const u = await seedVisitor({ name: 'U8', email: 'u8@x.com' })
    const pid = await seedPost('Reject Deletion Post', 'reject-deletion-post')
    const cid = await seedComment({
      userId: u,
      ownerId: pid,
      type: 'post',
      deleteRequestedAt: new Date(),
      deleteRequestedBy: u,
    })

    const admin = await seedAdmin()
    await resolveCommentDeleteRequest(db, String(cid), false, adminCtxFor(admin))

    const [row] = await db.select().from(comment).where(eq(comment.id, cid))
    expect(row!.deletedAt).toBeNull()
    expect(row!.deleteRequestedAt).toBeNull()
    expect(row!.deleteRequestedBy).toBeNull()

    const rows = await auditRowsFor('comment_delete_request_rejected')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('comment')
    expect(rows[0]!.resourceId).toBe(String(cid))
  })

  it('rejects with NOT_FOUND when the comment does not exist', async () => {
    const admin = await seedAdmin()
    await expect(resolveCommentDeleteRequest(db, '424242', true, adminCtxFor(admin))).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '评论不存在。',
    })
  })

  it('rejects with CONFLICT when there is no pending delete request', async () => {
    const u = await seedVisitor({ name: 'U9', email: 'u9@x.com' })
    const pid = await seedPost('No Request Post', 'no-request-post')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    const admin = await seedAdmin()
    await expect(resolveCommentDeleteRequest(db, String(cid), true, adminCtxFor(admin))).rejects.toMatchObject({
      code: 'CONFLICT',
      message: '该评论没有待处理的删除申请。',
    })

    // No state change, no audit event on the fenced path.
    const [row] = await db.select().from(comment).where(eq(comment.id, cid))
    expect(row!.deletedAt).toBeNull()
    expect(await auditRowsFor('comment_delete_request_approved')).toHaveLength(0)
  })
})
