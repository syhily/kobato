import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { CommentBody } from '@/shared/pt/comment-schema'

import { withCommentBadgeTextColor } from '@/server/domains/comments/badge'
import { findCommentWithUserAndTarget } from '@/server/domains/comments/repos/admin-query'
import {
  approveCommentById,
  bulkApprovePendingByUser,
  bulkSoftDeleteCommentsByUser,
} from '@/server/domains/comments/repos/moderation'
import {
  updateCommentBodyAndContent,
  updateOwnCommentBody,
  updateOwnCommentBodyAndPending,
} from '@/server/domains/comments/repos/mutate'
import { findCommentWithUserById } from '@/server/domains/comments/repos/public-query/by-id'
import { canonicalizeCommentBody } from '@/server/domains/comments/services/canonicalize'
import { sendApprovedComment, sendNewComment } from '@/server/domains/comments/services/email'
import { decideOwnEdit } from '@/server/domains/comments/services/policy'
import { asCommentTarget } from '@/server/domains/comments/services/shared'
import { fireAndForgetNotify } from '@/server/infra/email/admin-notification'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { idFromString } from '@/shared/utils/id'

const adminLog = getLogger('comments.admin')

// The sidebar latest-comments cache is invalidated inside the repo
// mutations themselves (`repos/moderation.ts`, `repos/mutate.ts`), so
// the service layer has no cache calls to forget.

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

// Bulk per-user moderation consumed by the admin users endpoints. The
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
