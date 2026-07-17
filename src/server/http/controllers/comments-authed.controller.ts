import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { isCommentOwner } from '@/server/domains/auth/rbac'
import { countApprovedRepliesOfComment, listMyCommentEntities } from '@/server/domains/comments/repos/admin-query'
import { findCommentWithUserById } from '@/server/domains/comments/repos/public-query/by-id'
import { loadMineCommentsPage } from '@/server/domains/comments/services/mine-comments'
import { clearDeleteRequest, requestDeleteComment, updateOwnComment } from '@/server/domains/comments/services/moderate'
import { authedProc } from '@/server/http/orpc-base'
import { commentBodySchema } from '@/shared/pt/comment-schema'
import { parseCommentEntity, serializeCommentEntity } from '@/shared/utils/comments'
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
    recordAuditEventFromContext(context, {
      action: 'comment_delete_requested',
      resourceType: 'comment',
      resourceId: input.commentId,
    })
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
    recordAuditEventFromContext(context, {
      action: 'comment_delete_request_cancelled',
      resourceType: 'comment',
      resourceId: input.commentId,
    })
    return { success: true }
  })

const loadMine = authedProc
  .route({ method: 'GET', path: '/comments/load-mine' })
  .input(
    z.object({
      offset: z.coerce.number().min(0).default(0),
      limit: z.coerce.number().min(1).max(100).default(20),
      status: z.enum(['all', 'pending', 'deleteRequested', 'deleted']).optional(),
      q: z.string().trim().max(200).optional(),
      entity: z.string().max(2048).optional(),
    }),
  )
  .output(
    z.object({
      items: z.array(
        z.object({
          id: z.string(),
          body: commentBodySchema,
          createdAtIso: z.string(),
          deletedAtIso: z.string().nullable(),
          deleteRequestedAtIso: z.string().nullable(),
          isPending: z.boolean(),
          entity: z.object({ title: z.string(), permalink: z.string() }).nullable(),
          parent: z.object({ name: z.string(), excerpt: z.string(), isDeleted: z.boolean() }).nullable(),
        }),
      ),
      total: z.number().int(),
      hasMore: z.boolean(),
    }),
  )
  .handler(async ({ input, context }) => {
    const userId = idFromString(context.viewer.userId)
    const entity = input.entity ? parseCommentEntity(input.entity) : null
    const filters = {
      status: input.status,
      q: input.q,
      entity: entity ?? undefined,
    }
    return loadMineCommentsPage(context.db, userId, input.offset, Math.min(input.limit, 100), filters)
  })

const searchMineEntities = authedProc
  .route({ method: 'GET', path: '/comments/search-mine-entities' })
  .input(z.object({ q: z.string().trim().max(100).optional() }))
  .output(z.object({ entities: z.array(z.object({ value: z.string(), label: z.string() })) }))
  .handler(async ({ input, context }) => {
    const userId = idFromString(context.viewer.userId)
    const rows = await listMyCommentEntities(context.db, userId, { q: input.q })
    return {
      entities: rows.map((e) => ({
        value: serializeCommentEntity({ type: e.type, ownerId: e.ownerId }),
        label: e.title,
      })),
    }
  })

export const commentsAuthedRouter = {
  updateOwn,
  requestDeleteOwn,
  cancelDeleteOwn,
  loadMine,
  searchMineEntities,
}
