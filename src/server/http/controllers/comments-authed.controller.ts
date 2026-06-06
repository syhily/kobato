import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { isCommentOwner } from '@/server/domains/auth/rbac'
import { asCommentItemsWire } from '@/server/domains/comments/projection'
import {
  countApprovedRepliesOfComment,
  countMyComments,
  listMyComments,
} from '@/server/domains/comments/repos/admin-query'
import { clearDeleteRequest, requestDeleteComment } from '@/server/domains/comments/repos/moderation'
import { findCommentWithUserById } from '@/server/domains/comments/repos/public-query/by-id'
import { updateOwnComment } from '@/server/domains/comments/services/moderate'
import { authedProc } from '@/server/http/orpc-base'
import { commentItemDto } from '@/shared/contracts/comments'
import { commentBodySchema } from '@/shared/pt/comment-schema'
import { idFromString } from '@/shared/utils/id'

const successOutput = z.object({ success: z.boolean() })

const updateOwn = authedProc
  .route({ method: 'POST', path: '/comments/update-own' })
  .input(z.object({ commentId: z.string(), body: commentBodySchema }))
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const commentId = input.commentId ? idFromString(input.commentId) : 0n
    if (commentId === 0n) {
      throw new ORPCError('BAD_REQUEST', { message: '缺少 commentId' })
    }
    const c = await findCommentWithUserById(context.db, commentId)
    if (!c || !isCommentOwner(context.viewer, c)) {
      throw new ORPCError('NOT_FOUND', { message: '资源不存在。' })
    }
    if (c.deleteRequestedAt !== null) {
      throw new ORPCError('CONFLICT', { message: '已申请删除，无法编辑。' })
    }
    const replyCount = await countApprovedRepliesOfComment(context.db, commentId)
    if (replyCount > 0) {
      throw new ORPCError('CONFLICT', { message: '已有回复，无法再编辑。' })
    }
    await updateOwnComment(context.db, String(commentId), input.body)
    recordAuditEventFromContext(context, {
      action: 'comment_own_updated',
      resourceType: 'comment',
      resourceId: input.commentId,
    })
    return { success: true }
  })

const requestDeleteOwn = authedProc
  .route({ method: 'POST', path: '/comments/request-delete-own' })
  .input(z.object({ commentId: z.string() }))
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const commentId = idFromString(input.commentId)
    const c = await findCommentWithUserById(context.db, commentId)
    if (!c || !isCommentOwner(context.viewer, c)) {
      throw new ORPCError('NOT_FOUND', { message: '资源不存在。' })
    }
    if (c.deleteRequestedAt !== null) {
      return { success: true }
    }
    await requestDeleteComment(context.db, commentId, idFromString(context.viewer.userId))
    return { success: true }
  })

const cancelDeleteOwn = authedProc
  .route({ method: 'POST', path: '/comments/cancel-delete-own' })
  .input(z.object({ commentId: z.string() }))
  .output(successOutput)
  .handler(async ({ input, context }) => {
    const commentId = idFromString(input.commentId)
    const c = await findCommentWithUserById(context.db, commentId)
    if (!c || !isCommentOwner(context.viewer, c)) {
      throw new ORPCError('NOT_FOUND', { message: '资源不存在。' })
    }
    const ok = await clearDeleteRequest(context.db, commentId, idFromString(context.viewer.userId))
    if (!ok) {
      throw new ORPCError('CONFLICT', { message: '无法撤回删除申请。' })
    }
    return { success: true }
  })

const listMine = authedProc
  .route({ method: 'GET', path: '/comments/list-mine' })
  .input(
    z.object({ offset: z.coerce.number().min(0).default(0), limit: z.coerce.number().min(1).max(100).default(20) }),
  )
  .output(
    z.object({
      comments: z.array(commentItemDto),
      total: z.number().int(),
      pending: z.number().int(),
      deleteRequested: z.number().int(),
      hasMore: z.boolean(),
    }),
  )
  .handler(async ({ input, context }) => {
    const userId = idFromString(context.viewer.userId)
    const offset = input.offset
    const limit = Math.min(input.limit, 100)
    const [comments, counts] = await Promise.all([
      listMyComments(context.db, userId, offset, limit),
      countMyComments(context.db, userId),
    ])
    return {
      comments: asCommentItemsWire(comments),
      total: counts.total,
      pending: counts.pending,
      deleteRequested: counts.deleteRequested,
      hasMore: offset + comments.length < counts.total,
    }
  })

export const commentsAuthedRouter = {
  updateOwn,
  requestDeleteOwn,
  cancelDeleteOwn,
  listMine,
}
