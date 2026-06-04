import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { CommentBody } from '@/shared/pt/comment-schema'

import { withCommentBadgeTextColor } from '@/server/domains/comments/badge'
import { clearLatestCommentsCache } from '@/server/domains/comments/cache'
import { findCommentWithUserAndTarget } from '@/server/domains/comments/repos/admin-query'
import { approveCommentById, deleteCommentById } from '@/server/domains/comments/repos/moderation'
import {
  updateCommentBodyAndContent,
  updateOwnCommentBody,
  updateOwnCommentBodyAndPending,
} from '@/server/domains/comments/repos/mutate'
import { findCommentWithUserById } from '@/server/domains/comments/repos/public-query/by-id'
import { canonicalizeCommentBody } from '@/server/domains/comments/services/canonicalize'
import { sendApprovedComment, sendNewComment } from '@/server/domains/comments/services/email'
import { asCommentTarget } from '@/server/domains/comments/services/shared'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { idFromString } from '@/shared/utils/id'

const adminLog = getLogger('comments.admin')
const OWN_EDIT_GRACE_MS = 30 * 60 * 1000

export async function approveComment(db: NodePgDatabase, rid: string) {
  const id = idFromString(rid)
  await approveCommentById(db, id)
  await clearLatestCommentsCache()
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

export async function deleteComment(db: NodePgDatabase, rid: string) {
  await deleteCommentById(db, idFromString(rid))
  await clearLatestCommentsCache()
}

export async function getCommentById(db: NodePgDatabase, rid: string) {
  return findCommentWithUserById(db, idFromString(rid))
}

export async function updateComment(db: NodePgDatabase, rid: string, newBody: CommentBody) {
  const id = idFromString(rid)
  const { body, content } = await canonicalizeCommentBody(newBody)
  await updateCommentBodyAndContent(db, id, body, content)
  await clearLatestCommentsCache()

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
  const insideGrace = Date.now() - existing.createAt.getTime() < OWN_EDIT_GRACE_MS

  // Optimistic-lock guard: if another request edited the same comment
  // between our read and our write, the update will affect 0 rows and
  // we reject the request so the client can retry with fresh state.
  const graceUpdatedAt = existing.updatedAt ?? existing.createAt
  if (insideGrace) {
    const affected = await updateOwnCommentBody(db, id, body, content, graceUpdatedAt)
    if (affected === 0) {
      throw new DomainError('CONFLICT', '评论已被修改，请刷新后重试。')
    }
  } else {
    const affected = await updateOwnCommentBodyAndPending(db, id, body, content, graceUpdatedAt)
    if (affected === 0) {
      throw new DomainError('CONFLICT', '评论已被修改，请刷新后重试。')
    }
  }

  const r = await findCommentWithUserById(db, id)
  if (r === null) {
    return null
  }

  if (!insideGrace) {
    if (r.type !== null && r.ownerId !== null) {
      const target = { type: r.type, ownerId: r.ownerId }
      void sendNewComment(db, r, target).catch((error) => {
        adminLog.error('failed to send new comment email (own edit)', { error })
      })
    } else {
      adminLog.warn('skipping new-comment email after own edit: missing target', { commentId: id })
    }
  }

  await clearLatestCommentsCache()
  return { ...withCommentBadgeTextColor(r), content: null }
}
