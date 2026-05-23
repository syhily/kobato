import type { CommentBody } from '@/shared/pt/comment-schema'

import { withCommentBadgeTextColor } from '@/server/domains/comments/badge'
import { canonicalizeCommentBody } from '@/server/domains/comments/canonicalize'
import { sendApprovedComment, sendNewComment } from '@/server/domains/comments/email'
import { findCommentWithUserAndTarget } from '@/server/domains/comments/repos/admin-query'
import { approveCommentById, deleteCommentById } from '@/server/domains/comments/repos/moderation'
import {
  updateCommentBodyAndContent,
  updateOwnCommentBody,
  updateOwnCommentBodyAndPending,
} from '@/server/domains/comments/repos/mutate'
import { findCommentWithUserById } from '@/server/domains/comments/repos/public-query'
import { asCommentTarget } from '@/server/domains/comments/services/shared'
import { getLogger } from '@/server/infra/logger'
import { idFromString } from '@/shared/utils/id'

const adminLog = getLogger('comments.admin')
const OWN_EDIT_GRACE_MS = 30 * 60 * 1000

export async function approveComment(rid: string) {
  const id = idFromString(rid)
  await approveCommentById(id)
  const c = await findCommentWithUserAndTarget(id)
  if (c) {
    const target = asCommentTarget(c.comment.type, c.comment.ownerId)
    if (target) {
      void sendApprovedComment(c.comment, c.user, target).catch((error) => {
        adminLog.error('failed to send approved comment email', { error })
      })
    }
  }
}

export async function deleteComment(rid: string) {
  await deleteCommentById(idFromString(rid))
}

export async function getCommentById(rid: string) {
  return findCommentWithUserById(idFromString(rid))
}

export async function updateComment(rid: string, newBody: CommentBody) {
  const id = idFromString(rid)
  const { body, content } = await canonicalizeCommentBody(newBody)
  await updateCommentBodyAndContent(id, body, content)

  const r = await findCommentWithUserById(id)
  if (r === null) {
    return null
  }

  return { ...withCommentBadgeTextColor(r), content: null }
}

export async function updateOwnComment(rid: string, newBody: CommentBody) {
  const id = idFromString(rid)
  const existing = await findCommentWithUserById(id)
  if (existing === null) {
    return null
  }
  const { body, content } = await canonicalizeCommentBody(newBody)
  const insideGrace = Date.now() - existing.createAt.getTime() < OWN_EDIT_GRACE_MS
  if (insideGrace) {
    await updateOwnCommentBody(id, body, content)
  } else {
    await updateOwnCommentBodyAndPending(id, body, content)
  }

  const r = await findCommentWithUserById(id)
  if (r === null) {
    return null
  }

  if (!insideGrace) {
    if (r.type !== null && r.ownerId !== null) {
      const target = { type: r.type, ownerId: r.ownerId }
      void sendNewComment(r, target).catch((error) => {
        adminLog.error('failed to send new comment email (own edit)', { error })
      })
    } else {
      adminLog.warn('skipping new-comment email after own edit: missing target', { commentId: id })
    }
  }

  return { ...withCommentBadgeTextColor(r), content: null }
}
