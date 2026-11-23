import type { Database } from '@kobato/db/sqlite/database'
import type { CommentEditorState } from '@kobato/inkling/headless/comment-schema'
import type { AuditContext } from '@kobato/server/domains/audit/types'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'

import { countApprovedRepliesOfComment, findCommentWithUserById } from '@kobato/db/sqlite/operations/engagement/comment'
import { findCommentWithUserAndTarget } from '@kobato/db/sqlite/operations/engagement/comment-admin'
import {
  adminClearDeleteRequest as adminClearDeleteRequestOp,
  approveCommentById as approveCommentByIdOp,
  bulkApprovePendingByUser as bulkApprovePendingByUserOp,
  bulkSoftDeleteCommentsByUser as bulkSoftDeleteCommentsByUserOp,
  clearDeleteRequest as clearDeleteRequestOp,
  deleteCommentById as deleteCommentByIdOp,
  requestDeleteComment as requestDeleteCommentOp,
  softDeleteCommentById as softDeleteCommentByIdOp,
  updateCommentBodyAndContent,
  updateOwnCommentBody,
  updateOwnCommentBodyAndPending,
} from '@kobato/db/sqlite/operations/engagement/comment-mutate'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { isCommentOwner } from '@kobato/server/domains/auth/rbac'
import { withCommentBadgeTextColor } from '@kobato/server/domains/comments/badge'
import { canonicalizeCommentBody } from '@kobato/server/domains/comments/services/canonicalize'
import { sendApprovedComment, sendNewComment } from '@kobato/server/domains/comments/services/email'
import { decideOwnEdit } from '@kobato/server/domains/comments/services/policy'
import { asCommentTarget } from '@kobato/server/domains/comments/services/shared'
import { fireAndForgetNotify } from '@kobato/server/infra/email/admin-notification'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError, ErrorMessages } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { idFromString } from '@kobato/utils/id'

const adminLog = getLogger('comments.admin')

export async function approveCommentById(db: Database, id: number): Promise<void> {
  await approveCommentByIdOp(db, id)
}

export async function deleteCommentById(db: Database, id: number): Promise<void> {
  await deleteCommentByIdOp(db, id)
}

export async function softDeleteCommentById(db: Database, id: number): Promise<void> {
  await softDeleteCommentByIdOp(db, id)
}

export async function bulkApprovePendingByUser(db: Database, userId: number): Promise<number> {
  return bulkApprovePendingByUserOp(db, userId)
}

export async function bulkSoftDeleteCommentsByUser(db: Database, userId: number): Promise<number> {
  return bulkSoftDeleteCommentsByUserOp(db, userId)
}

export async function requestDeleteComment(db: Database, id: number, userId: number): Promise<void> {
  await requestDeleteCommentOp(db, id, userId)
}

export async function clearDeleteRequest(db: Database, id: number, userId: number): Promise<boolean> {
  return clearDeleteRequestOp(db, id, userId)
}

export async function adminClearDeleteRequest(db: Database, id: number): Promise<boolean> {
  return adminClearDeleteRequestOp(db, id)
}

export async function resolveCommentDeleteRequest(
  db: Database,
  rid: string,
  approve: boolean,
  audit: AuditContext,
): Promise<void> {
  const id = idFromString(rid)
  const existing = await findCommentWithUserById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('comments.error.notFound'))
  }
  if (existing.deleteRequestedAt === null) {
    throw new DomainError('CONFLICT', descriptorFor('comments.error.noPendingDelete'))
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

export async function approveComment(db: Database, rid: string) {
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

export async function updateComment(db: Database, rid: string, newBody: CommentEditorState) {
  const id = idFromString(rid)
  const { body, content } = await canonicalizeCommentBody(newBody)
  await updateCommentBodyAndContent(db, id, body, content)

  const r = await findCommentWithUserById(db, id)
  if (r === null) {
    return null
  }

  return withCommentBadgeTextColor(r)
}

export async function updateOwnComment(db: Database, rid: string, newBody: CommentEditorState) {
  const id = idFromString(rid)
  const existing = await findCommentWithUserById(db, id)
  if (existing === null) {
    return null
  }
  const { body, content } = await canonicalizeCommentBody(newBody)
  const decision = decideOwnEdit(existing, Date.now())

  const graceUpdatedAt = existing.updatedAt ?? existing.createAt
  const affected =
    decision === 'silent-edit'
      ? await updateOwnCommentBody(db, id, body, content, graceUpdatedAt)
      : await updateOwnCommentBodyAndPending(db, id, body, content, graceUpdatedAt)
  if (affected === 0) {
    throw new DomainError('CONFLICT', descriptorFor('comments.error.modified'))
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

  return withCommentBadgeTextColor(r)
}

export async function applyOwnCommentEdit(db: Database, rid: string, newBody: CommentEditorState) {
  const id = idFromString(rid)
  const existing = await findCommentWithUserById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
  if (existing.deleteRequestedAt !== null) {
    throw new DomainError('CONFLICT', descriptorFor('comments.error.deleteRequested'))
  }
  const replyCount = await countApprovedRepliesOfComment(db, id)
  if (replyCount > 0) {
    throw new DomainError('CONFLICT', descriptorFor('comments.error.hasReplies'))
  }
  const updated = await updateOwnComment(db, rid, newBody)
  if (updated === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('comments.error.updateFailed'))
  }
  return updated
}

export async function editOwnComment(
  db: Database,
  rid: string,
  newBody: CommentEditorState,
  viewer: ViewerIdentity,
  audit: AuditContext,
) {
  const existing = await findCommentWithUserById(db, idFromString(rid))
  if (existing === null || !isCommentOwner(viewer, existing)) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
  const updated = await applyOwnCommentEdit(db, rid, newBody)
  recordAuditEventFromContext(audit, {
    action: 'comment_own_updated',
    resourceType: 'comment',
    resourceId: rid,
  })
  return updated
}

export async function requestOwnCommentDeletion(
  db: Database,
  rid: string,
  viewer: ViewerIdentity,
  audit: AuditContext,
) {
  const id = idFromString(rid)
  const existing = await findCommentWithUserById(db, id)
  if (existing === null || !isCommentOwner(viewer, existing)) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
  if (existing.deleteRequestedAt !== null) {
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
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
  return updated
}

export async function cancelOwnCommentDeletion(db: Database, rid: string, viewer: ViewerIdentity, audit: AuditContext) {
  const id = idFromString(rid)
  const existing = await findCommentWithUserById(db, id)
  if (existing === null || !isCommentOwner(viewer, existing)) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
  const ok = await clearDeleteRequest(db, id, idFromString(viewer.id))
  if (!ok) {
    throw new DomainError('CONFLICT', descriptorFor('comments.error.withdrawFailed'))
  }
  recordAuditEventFromContext(audit, {
    action: 'comment_delete_request_cancelled',
    resourceType: 'comment',
    resourceId: rid,
  })
  const updated = await findCommentWithUserById(db, id)
  if (updated === null) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
  return updated
}

export async function bulkApproveCommentsByUser(db: Database, userId: number): Promise<{ approved: number }> {
  const approved = await bulkApprovePendingByUser(db, userId)
  return { approved }
}

export async function bulkDeleteCommentsByUser(db: Database, userId: number): Promise<{ deleted: number }> {
  const deleted = await bulkSoftDeleteCommentsByUser(db, userId)
  return { deleted }
}
