import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, eq, isNotNull, isNull } from 'drizzle-orm'

import type { AuditContext } from '@/server/domains/audit/types'
import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { isCommentOwner } from '@/server/domains/auth/rbac'
import { withCommentBadgeTextColor } from '@/server/domains/comments/badge'
import { findCommentWithUserAndTarget } from '@/server/domains/comments/repos/admin-query'
import {
  updateCommentBodyAndContent,
  updateOwnCommentBody,
  updateOwnCommentBodyAndPending,
} from '@/server/domains/comments/repos/mutate'
import { canonicalizeCommentBody } from '@/server/domains/comments/services/canonicalize'
import { sendApprovedComment, sendNewComment } from '@/server/domains/comments/services/email'
import { countApprovedRepliesOfComment, findCommentWithUserById } from '@/server/domains/comments/services/lookup'
import { decideOwnEdit } from '@/server/domains/comments/services/policy'
import { asCommentTarget } from '@/server/domains/comments/services/shared'
import { invalidateContent } from '@/server/domains/content/invalidate'
import { comment } from '@/server/infra/db/schema/comment'
import { fireAndForgetNotify } from '@/server/infra/email/admin-notification'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { idFromString } from '@/shared/utils/id'

const adminLog = getLogger('comments.admin')

// Cache-invalidation invariant: every mutation that changes what the
// sidebar latest-comments list shows emits `{ entity: 'comment' }`
// through the content-invalidation door HERE, inside the mutation
// itself, so a new caller can never forget it. The delete-request trio
// (requestDeleteComment / clearDeleteRequest / adminClearDeleteRequest)
// deliberately does NOT emit: they only touch `deleteRequestedAt`,
// which the latest-comments query does not filter on.

export async function approveCommentById(db: NodePgDatabase, id: bigint): Promise<void> {
  await db.update(comment).set({ isPending: false }).where(eq(comment.id, id))
  await invalidateContent(db, { entity: 'comment' })
}

export async function deleteCommentById(db: NodePgDatabase, id: bigint): Promise<void> {
  await db.delete(comment).where(eq(comment.id, id))
  await invalidateContent(db, { entity: 'comment' })
}

export async function softDeleteCommentById(db: NodePgDatabase, id: bigint): Promise<void> {
  await db.update(comment).set({ deletedAt: new Date() }).where(eq(comment.id, id))
  await invalidateContent(db, { entity: 'comment' })
}

export async function bulkApprovePendingByUser(db: NodePgDatabase, userId: bigint): Promise<number> {
  // Returns the number of pending comments that were just approved.
  const updated = await db
    .update(comment)
    .set({ isPending: false })
    .where(and(eq(comment.userId, userId), eq(comment.isPending, true), isNull(comment.deletedAt)))
    .returning({ id: comment.id })
  await invalidateContent(db, { entity: 'comment' })
  return updated.length
}

export async function bulkSoftDeleteCommentsByUser(db: NodePgDatabase, userId: bigint): Promise<number> {
  // Soft-deletion mirrors the per-row delete used by the existing admin
  // page. We avoid the hard `DELETE` so moderation actions remain
  // recoverable and downstream like-counts stay consistent.
  const updated = await db
    .update(comment)
    .set({ deletedAt: new Date() })
    .where(and(eq(comment.userId, userId), isNull(comment.deletedAt)))
    .returning({ id: comment.id })
  await invalidateContent(db, { entity: 'comment' })
  return updated.length
}

export async function requestDeleteComment(db: NodePgDatabase, id: bigint, userId: bigint): Promise<void> {
  await db
    .update(comment)
    .set({ deleteRequestedAt: new Date(), deleteRequestedBy: userId })
    .where(and(eq(comment.id, id), isNull(comment.deletedAt)))
}

export async function clearDeleteRequest(db: NodePgDatabase, id: bigint, userId: bigint): Promise<boolean> {
  const updated = await db
    .update(comment)
    .set({ deleteRequestedAt: null, deleteRequestedBy: null })
    .where(
      and(
        eq(comment.id, id),
        eq(comment.deleteRequestedBy, userId),
        isNull(comment.deletedAt),
        isNotNull(comment.deleteRequestedAt),
      ),
    )
    .returning({ id: comment.id })
  return updated.length > 0
}

/**
 * Admin-side variant of {@link clearDeleteRequest}: clears the pending
 * delete request regardless of who originated it. Used by the
 * "reject delete request" admin action.
 */
export async function adminClearDeleteRequest(db: NodePgDatabase, id: bigint): Promise<boolean> {
  const updated = await db
    .update(comment)
    .set({ deleteRequestedAt: null, deleteRequestedBy: null })
    .where(and(eq(comment.id, id), isNotNull(comment.deleteRequestedAt)))
    .returning({ id: comment.id })
  return updated.length > 0
}

/**
 * Admin decision on a pending delete request — the moderation state
 * machine lifted from the admin comments controller: the comment must
 * exist and carry a `deleteRequestedAt`; approving soft-deletes it,
 * rejecting clears the request. Each branch audits its own event. Error
 * codes/messages are the wire contract — do not reword.
 */
export async function resolveCommentDeleteRequest(
  db: NodePgDatabase,
  rid: string,
  approve: boolean,
  audit: AuditContext,
): Promise<void> {
  const id = idFromString(rid)
  const existing = await findCommentWithUserById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '评论不存在。')
  }
  if (existing.deleteRequestedAt === null) {
    throw new DomainError('CONFLICT', '该评论没有待处理的删除申请。')
  }
  if (approve) {
    await softDeleteCommentById(db, id)
    recordAuditEventFromContext(audit, {
      action: 'comment_delete_request_approved',
      resourceType: 'comment',
      resourceId: rid,
    })
  } else {
    await adminClearDeleteRequest(db, id)
    recordAuditEventFromContext(audit, {
      action: 'comment_delete_request_rejected',
      resourceType: 'comment',
      resourceId: rid,
    })
  }
}

export async function approveComment(db: NodePgDatabase, rid: string) {
  const id = idFromString(rid)
  await approveCommentById(db, id)
  const c = await findCommentWithUserAndTarget(db, id)
  if (c) {
    const target = asCommentTarget(c.comment.type, c.comment.ownerId)
    if (target) {
      void sendApprovedComment(db, c.comment, c.user, target).catch((error) => {
        adminLog.error('failed to send approved comment email', { error })
      })
    }
  }
}

export async function updateComment(db: NodePgDatabase, rid: string, newBody: CommentBody) {
  const id = idFromString(rid)
  const { body, content } = await canonicalizeCommentBody(newBody)
  await updateCommentBodyAndContent(db, id, body, content)

  const r = await findCommentWithUserById(db, id)
  if (r === null) {
    return null
  }

  return { ...withCommentBadgeTextColor(r), content: null }
}

export async function updateOwnComment(db: NodePgDatabase, rid: string, newBody: CommentBody) {
  const id = idFromString(rid)
  const existing = await findCommentWithUserById(db, id)
  if (existing === null) {
    return null
  }
  const { body, content } = await canonicalizeCommentBody(newBody)
  const decision = decideOwnEdit(existing, Date.now())

  // Optimistic-lock guard: if another request edited the same comment
  // between our read and our write, the update will affect 0 rows and
  // we reject the request so the client can retry with fresh state.
  const graceUpdatedAt = existing.updatedAt ?? existing.createAt
  const affected =
    decision === 'silent-edit'
      ? await updateOwnCommentBody(db, id, body, content, graceUpdatedAt)
      : await updateOwnCommentBodyAndPending(db, id, body, content, graceUpdatedAt)
  if (affected === 0) {
    throw new DomainError('CONFLICT', '评论已被修改，请刷新后重试。')
  }

  const r = await findCommentWithUserById(db, id)
  if (r === null) {
    return null
  }

  if (decision === 're-pend') {
    if (r.type !== null && r.ownerId !== null) {
      const target = { type: r.type, ownerId: r.ownerId }
      fireAndForgetNotify(sendNewComment(db, r, target), adminLog, 'new comment (own edit)')
    } else {
      adminLog.warn('skipping new-comment email after own edit: missing target', { commentId: id })
    }
  }

  return { ...withCommentBadgeTextColor(r), content: null }
}

/**
 * Visitor self-edit of their own comment — the full update-own flow lifted
 * from the authed comments controller: fetch → ownership check → the
 * delete-request fence → the has-replies edit lock → the grace-window
 * mutation in {@link updateOwnComment}. Audits `comment_own_updated` on
 * success. Error codes/messages are the wire contract — do not reword.
 */
export async function editOwnComment(
  db: NodePgDatabase,
  rid: string,
  newBody: CommentBody,
  viewer: ViewerIdentity,
  audit: AuditContext,
) {
  const id = idFromString(rid)
  const existing = await findCommentWithUserById(db, id)
  if (existing === null || !isCommentOwner(viewer, existing)) {
    throw new DomainError('NOT_FOUND', '资源不存在。')
  }
  if (existing.deleteRequestedAt !== null) {
    throw new DomainError('CONFLICT', '已申请删除，无法编辑。')
  }
  // Edit lock: once approved replies exist, editing the parent would
  // rewrite the context those replies responded to.
  const replyCount = await countApprovedRepliesOfComment(db, id)
  if (replyCount > 0) {
    throw new DomainError('CONFLICT', '已有回复，无法再编辑。')
  }
  const updated = await updateOwnComment(db, rid, newBody)
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '更新评论失败')
  }
  recordAuditEventFromContext(audit, {
    action: 'comment_own_updated',
    resourceType: 'comment',
    resourceId: rid,
  })
  return updated
}

/**
 * Visitor self-service delete request — the full request-delete-own flow
 * lifted from the authed comments controller: fetch → ownership check →
 * the already-requested idempotent no-op → the flag-setting mutation in
 * {@link requestDeleteComment} → audit `comment_delete_requested` →
 * re-fetch the fresh row. Error codes/messages are the wire contract —
 * do not reword.
 */
export async function requestOwnCommentDeletion(
  db: NodePgDatabase,
  rid: string,
  viewer: ViewerIdentity,
  audit: AuditContext,
) {
  const id = idFromString(rid)
  const existing = await findCommentWithUserById(db, id)
  if (existing === null || !isCommentOwner(viewer, existing)) {
    throw new DomainError('NOT_FOUND', '资源不存在。')
  }
  if (existing.deleteRequestedAt !== null) {
    // Idempotent no-op: the flag is already set, so the current row IS
    // the updated one — return it without re-writing or re-auditing.
    return existing
  }
  await requestDeleteComment(db, id, idFromString(viewer.id))
  recordAuditEventFromContext(audit, {
    action: 'comment_delete_requested',
    resourceType: 'comment',
    resourceId: rid,
  })
  const updated = await findCommentWithUserById(db, id)
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '资源不存在。')
  }
  return updated
}

/**
 * Visitor self-service cancel of a pending delete request — the full
 * cancel-delete-own flow lifted from the authed comments controller:
 * fetch → ownership check → the guarded mutation in
 * {@link clearDeleteRequest} → audit `comment_delete_request_cancelled` →
 * re-fetch the fresh row. Error codes/messages are the wire contract —
 * do not reword.
 */
export async function cancelOwnCommentDeletion(
  db: NodePgDatabase,
  rid: string,
  viewer: ViewerIdentity,
  audit: AuditContext,
) {
  const id = idFromString(rid)
  const existing = await findCommentWithUserById(db, id)
  if (existing === null || !isCommentOwner(viewer, existing)) {
    throw new DomainError('NOT_FOUND', '资源不存在。')
  }
  const ok = await clearDeleteRequest(db, id, idFromString(viewer.id))
  if (!ok) {
    throw new DomainError('CONFLICT', '无法撤回删除申请。')
  }
  recordAuditEventFromContext(audit, {
    action: 'comment_delete_request_cancelled',
    resourceType: 'comment',
    resourceId: rid,
  })
  const updated = await findCommentWithUserById(db, id)
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '资源不存在。')
  }
  return updated
}

// comments repos stay internal to the comments domain — cross-domain
// callers (users admin) go through these named services.

export async function bulkApproveCommentsByUser(db: NodePgDatabase, userId: bigint): Promise<{ approved: number }> {
  const approved = await bulkApprovePendingByUser(db, userId)
  return { approved }
}

export async function bulkDeleteCommentsByUser(db: NodePgDatabase, userId: bigint): Promise<{ deleted: number }> {
  const deleted = await bulkSoftDeleteCommentsByUser(db, userId)
  return { deleted }
}
