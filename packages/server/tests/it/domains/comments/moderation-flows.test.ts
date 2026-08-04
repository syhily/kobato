import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexCommentBody } from '#/_helpers/lexical-body'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'

import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import {
  cancelOwnCommentDeletion,
  editOwnComment,
  requestOwnCommentDeletion,
  resolveCommentDeleteRequest,
} from '@kobato/server/domains/comments/services/moderate'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { comment } from '@kobato/server/infra/db/schema/comment'
import { auditLog } from '@kobato/server/infra/db/schema/config'
import { post } from '@kobato/server/infra/db/schema/post'
import { user } from '@kobato/server/infra/db/schema/user'
import { EMPTY_LEXICAL_COMMENT_BODY } from '@kobato/shared/lexical/comment-schema'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Domain-seam coverage for the two moderation flows sunk out of the HTTP
// controllers (task C4):
//
//   * `editOwnComment` — the update-own-comment flow: ownership check,
//     delete-request fence, has-replies edit lock, then the grace-window
//     mutation (pinned separately in `update-own-comment.test.ts`);
//   * `resolveCommentDeleteRequest` — the admin delete-request state
//     machine: existence fence, pending-request fence, approve →
//     soft-delete / reject → clear, each branch auditing its own event;
//   * `requestOwnCommentDeletion` / `cancelOwnCommentDeletion` — the
//     visitor delete-request lifecycle: ownership fence, the
//     already-requested idempotent no-op, the guarded clear, each
//     mutating branch auditing its own event.
//
// The error codes and Chinese messages asserted here are the wire
// contract — the controllers used to throw them inline as `ORPCError`s
// and the oRPC `domainErrorGuard` now translates these `DomainError`s
// into the byte-identical wire shape.

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
})

afterEach(() => {
  resetAllBatchers()
})

async function seedVisitor(opts: Partial<typeof user.$inferInsert> = {}): Promise<number> {
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

async function seedPost(title: string, slug: string): Promise<number> {
  const rows = await db
    .insert(post)
    .values({
      slug,
      title,
      summary: '',
      published: true,
      publishedRevisionId: 1,
    })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function seedComment(opts: Partial<typeof comment.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(comment)
    .values({
      type: opts.type ?? 'post',
      ownerId: opts.ownerId ?? 1,
      userId: opts.userId ?? 1,
      content: opts.content ?? 'hello',
      body: opts.body ?? EMPTY_LEXICAL_COMMENT_BODY,
      rid: opts.rid ?? 0,
      rootId: opts.rootId ?? 0,
      isPending: opts.isPending ?? false,
      ...opts,
    })
    .returning({ id: comment.id })
  return rows[0]!.id
}

function ctxFor(userId: number) {
  return makeAuthedCtx({ userId: String(userId), role: 'visitor', db })
}

async function seedAdmin(opts: Partial<typeof user.$inferInsert> = {}): Promise<number> {
  // The audit row's actor_id FK requires a real user row — a synthetic id
  // would silently dead-letter the batched insert.
  return seedVisitor({
    name: 'Admin',
    email: `admin-${Date.now()}-${Math.random()}@example.com`,
    role: 'admin',
    ...opts,
  })
}

function adminCtxFor(adminId: number) {
  return makeAuthedCtx({ userId: String(adminId), role: 'admin', db })
}

const EDITED_BODY = lexCommentBody('edited body')

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

describe('requestOwnCommentDeletion — visitor delete-request flow', () => {
  it('flags the owned comment and audits comment_delete_requested', async () => {
    const u = await seedVisitor({ name: 'U10', email: 'u10@x.com' })
    const pid = await seedPost('Request Deletion Post', 'request-deletion-post')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    const ctx = ctxFor(u)
    const updated = await requestOwnCommentDeletion(db, String(cid), ctx.viewer!, ctx)

    expect(updated.id).toBe(cid)
    expect(updated.deleteRequestedAt).not.toBeNull()
    expect(updated.deleteRequestedBy).toBe(u)

    const rows = await auditRowsFor('comment_delete_requested')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('comment')
    expect(rows[0]!.resourceId).toBe(String(cid))
    expect(rows[0]!.actorId).toBe(u)
  })

  it('is an idempotent no-op when the flag is already set — no rewrite, no duplicate audit', async () => {
    const u = await seedVisitor({ name: 'U11', email: 'u11@x.com' })
    const pid = await seedPost('Request Deletion Twice', 'request-deletion-twice')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    const ctx = ctxFor(u)
    const first = await requestOwnCommentDeletion(db, String(cid), ctx.viewer!, ctx)
    const second = await requestOwnCommentDeletion(db, String(cid), ctx.viewer!, ctx)

    expect(second.deleteRequestedAt).toEqual(first.deleteRequestedAt)
    expect(await auditRowsFor('comment_delete_requested')).toHaveLength(1)
  })

  it('rejects with NOT_FOUND when the comment belongs to somebody else', async () => {
    const owner = await seedVisitor({ name: 'U12', email: 'u12@x.com' })
    const stranger = await seedVisitor({ name: 'U13', email: 'u13@x.com' })
    const pid = await seedPost('Foreign Request Post', 'foreign-request-post')
    const cid = await seedComment({ userId: owner, ownerId: pid, type: 'post' })

    const ctx = ctxFor(stranger)
    await expect(requestOwnCommentDeletion(db, String(cid), ctx.viewer!, ctx)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '资源不存在。',
    })

    // The fence fired before any write: no flag, no audit event.
    const [row] = await db.select().from(comment).where(eq(comment.id, cid))
    expect(row!.deleteRequestedAt).toBeNull()
    expect(await auditRowsFor('comment_delete_requested')).toHaveLength(0)
  })
})

describe('cancelOwnCommentDeletion — visitor cancel-delete-request flow', () => {
  it('clears the pending request and audits comment_delete_request_cancelled', async () => {
    const u = await seedVisitor({ name: 'U14', email: 'u14@x.com' })
    const pid = await seedPost('Cancel Deletion Post', 'cancel-deletion-post')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    const ctx = ctxFor(u)
    await requestOwnCommentDeletion(db, String(cid), ctx.viewer!, ctx)
    const updated = await cancelOwnCommentDeletion(db, String(cid), ctx.viewer!, ctx)

    expect(updated.id).toBe(cid)
    expect(updated.deleteRequestedAt).toBeNull()
    expect(updated.deleteRequestedBy).toBeNull()

    const rows = await auditRowsFor('comment_delete_request_cancelled')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceType).toBe('comment')
    expect(rows[0]!.resourceId).toBe(String(cid))
    expect(rows[0]!.actorId).toBe(u)
  })

  it('rejects with CONFLICT when there is no pending delete request', async () => {
    const u = await seedVisitor({ name: 'U15', email: 'u15@x.com' })
    const pid = await seedPost('No Request Cancel Post', 'no-request-cancel-post')
    const cid = await seedComment({ userId: u, ownerId: pid, type: 'post' })

    const ctx = ctxFor(u)
    await expect(cancelOwnCommentDeletion(db, String(cid), ctx.viewer!, ctx)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: '无法撤回删除申请。',
    })
    expect(await auditRowsFor('comment_delete_request_cancelled')).toHaveLength(0)
  })

  it('rejects with NOT_FOUND when the comment belongs to somebody else', async () => {
    const owner = await seedVisitor({ name: 'U16', email: 'u16@x.com' })
    const stranger = await seedVisitor({ name: 'U17', email: 'u17@x.com' })
    const pid = await seedPost('Foreign Cancel Post', 'foreign-cancel-post')
    const cid = await seedComment({
      userId: owner,
      ownerId: pid,
      type: 'post',
      deleteRequestedAt: new Date(),
      deleteRequestedBy: owner,
    })

    const ctx = ctxFor(stranger)
    await expect(cancelOwnCommentDeletion(db, String(cid), ctx.viewer!, ctx)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '资源不存在。',
    })

    // The fence fired before any write: the request is still pending.
    const [row] = await db.select().from(comment).where(eq(comment.id, cid))
    expect(row!.deleteRequestedAt).not.toBeNull()
    expect(await auditRowsFor('comment_delete_request_cancelled')).toHaveLength(0)
  })
})
