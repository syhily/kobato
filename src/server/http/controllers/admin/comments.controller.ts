import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { asAdminCommentsWire } from '@/server/domains/comments/projection'
import { adminClearDeleteRequest, softDeleteCommentById } from '@/server/domains/comments/repos/moderation'
import { findCommentWithUserById } from '@/server/domains/comments/repos/public-query/by-id'
import {
  loadAdminPendingDashboard,
  loadAllComments,
  searchAuthorOptions,
  searchPageOptions,
} from '@/server/domains/comments/services/admin-query'
import { approveComment, deleteComment } from '@/server/domains/comments/services/moderate'
import { adminProc } from '@/server/http/orpc-base'
import { adminCommentDto, adminPendingDashboardDto } from '@/shared/contracts/comments'
import { idFromString } from '@/shared/utils/id'

const approve = adminProc
  .route({ method: 'POST', path: '/comment-admin/approve' })
  .input(z.object({ rid: z.string() }))
  .output(z.void())
  .handler(async ({ input, context }) => {
    await approveComment(context.db, input.rid)
    recordAuditEventFromContext(context, {
      action: 'comment_approved',
      resourceType: 'comment',
      resourceId: input.rid,
    })
  })

const deleteOne = adminProc
  .route({ method: 'POST', path: '/comment-admin/delete' })
  .input(z.object({ rid: z.string() }))
  .output(z.void())
  .handler(async ({ input, context }) => {
    await deleteComment(context.db, input.rid)
    recordAuditEventFromContext(context, {
      action: 'comment_deleted',
      resourceType: 'comment',
      resourceId: input.rid,
    })
  })

const loadAll = adminProc
  .route({ method: 'GET', path: '/comment-admin/load-all' })
  .input(
    z.object({
      offset: z.number().min(0),
      limit: z.number().min(1).max(100),
      pageKey: z.string().optional(),
      userId: z.string().optional(),
      status: z.enum(['all', 'pending', 'approved']).optional(),
      q: z.string().trim().max(200).optional(),
      match: z.enum(['contains', 'does-not-contain']).optional(),
      createdAfter: z.iso.datetime().optional(),
      createdBefore: z.iso.datetime().optional(),
    }),
  )
  .output(
    z.object({
      comments: z.array(adminCommentDto),
      total: z.number().int(),
      hasMore: z.boolean(),
      statusCounts: z.object({
        all: z.number().int(),
        pending: z.number().int(),
        approved: z.number().int(),
      }),
    }),
  )
  .handler(async ({ input, context }) => {
    const result = await loadAllComments(context.db, {
      offset: input.offset,
      limit: input.limit,
      filterPublicId: input.pageKey,
      filterUserId: input.userId ? idFromString(input.userId) : undefined,
      status: input.status,
      filterQ: input.q,
      filterMatch: input.match,
      filterCreatedAfter: input.createdAfter ? new Date(input.createdAfter) : undefined,
      filterCreatedBefore: input.createdBefore ? new Date(input.createdBefore) : undefined,
    })
    return {
      comments: asAdminCommentsWire(result.comments),
      total: result.total,
      hasMore: result.hasMore,
      statusCounts: result.statusCounts,
    }
  })

const filterAutocompleteInput = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  ids: z.string().max(400).optional(),
  key: z.string().max(2048).optional(),
})

const searchPages = adminProc
  .route({ method: 'GET', path: '/comment-admin/search-pages' })
  .input(filterAutocompleteInput)
  .output(z.object({ pages: z.array(z.object({ key: z.string(), title: z.string().nullable() })) }))
  .handler(async ({ input, context }) => {
    const keys = input.key ? [input.key] : undefined
    const pages = await searchPageOptions(context.db, input.q, input.limit, keys)
    return { pages }
  })

const searchAuthors = adminProc
  .route({ method: 'GET', path: '/comment-admin/search-authors' })
  .input(filterAutocompleteInput)
  .output(z.object({ authors: z.array(z.object({ id: z.string(), name: z.string() })) }))
  .handler(async ({ input, context }) => {
    function parseBigIntIds(raw: string | undefined): bigint[] | undefined {
      if (!raw || raw.length === 0) {
        return undefined
      }
      const out: bigint[] = []
      for (const value of raw.split(',')) {
        const trimmed = value.trim()
        if (!trimmed) {
          continue
        }
        try {
          out.push(idFromString(trimmed))
        } catch {
          /* drop */
        }
      }
      return out.length > 0 ? out : undefined
    }
    const ids = parseBigIntIds(input.ids)
    const authors = await searchAuthorOptions(context.db, input.q, input.limit, ids)
    return { authors: authors.map((author) => ({ id: String(author.id), name: author.name })) }
  })

const approveCommentDeletion = adminProc
  .route({ method: 'POST', path: '/comment-admin/approve-comment-deletion' })
  .input(z.object({ commentId: z.string(), approve: z.boolean() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const id = idFromString(input.commentId)
    const c = await findCommentWithUserById(context.db, id)
    if (!c) {
      throw new ORPCError('NOT_FOUND', { message: '评论不存在。' })
    }
    if (c.deleteRequestedAt === null) {
      throw new ORPCError('CONFLICT', { message: '该评论没有待处理的删除申请。' })
    }
    if (input.approve) {
      await softDeleteCommentById(context.db, id)
      recordAuditEventFromContext(context, {
        action: 'comment_delete_request_approved',
        resourceType: 'comment',
        resourceId: input.commentId,
      })
    } else {
      await adminClearDeleteRequest(context.db, id)
      recordAuditEventFromContext(context, {
        action: 'comment_delete_request_rejected',
        resourceType: 'comment',
        resourceId: input.commentId,
      })
    }
    return { success: true }
  })

const listPendingDashboard = adminProc
  .route({ method: 'GET', path: '/comment-admin/list-pending-dashboard' })
  .input(
    z.object({
      kind: z.enum(['all', 'approval', 'deletion']).optional().default('all'),
      offset: z.number().optional(),
      limit: z.number().optional(),
    }),
  )
  .output(adminPendingDashboardDto)
  .handler(async ({ input, context }) => {
    return loadAdminPendingDashboard(context.db, input.kind, input.offset ?? 0, input.limit ?? 20)
  })

export const adminCommentsRouter = {
  approve,
  delete: deleteOne,
  loadAll,
  searchPages,
  searchAuthors,
  approveCommentDeletion,
  listPendingDashboard,
}
