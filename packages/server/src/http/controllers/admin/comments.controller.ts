import { adminCommentsContract } from '@kobato/api/rpc/admin/comments'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { asAdminCommentsWire, asCommentItemWire } from '@kobato/server/domains/comments/projection'
import {
  countAdminPendingDashboard,
  loadAdminPendingDashboard,
  loadAllComments,
  searchAuthorOptions,
  searchPageOptions,
} from '@kobato/server/domains/comments/services/admin-query'
import { probeAvatarMirrors as probeAvatarMirrorUrls } from '@kobato/server/domains/comments/services/avatar'
import {
  approveComment,
  deleteCommentById,
  resolveCommentDeleteRequest,
  updateComment,
} from '@kobato/server/domains/comments/services/moderate'
import { implementAdmin, localizedOrpcError } from '@kobato/server/http/orpc-base'
import { idFromString } from '@kobato/utils/id'

const impl = implementAdmin(adminCommentsContract)

const approve = impl.approve.handler(async ({ input, context }) => {
  await approveComment(context.db, input.commentId)
  recordAuditEventFromContext(context, {
    action: 'comment_approved',
    resourceType: 'comment',
    resourceId: input.commentId,
  })
})

const deleteOne = impl.delete.handler(async ({ input, context }) => {
  await deleteCommentById(context.db, idFromString(input.commentId))
  recordAuditEventFromContext(context, {
    action: 'comment_deleted',
    resourceType: 'comment',
    resourceId: input.commentId,
  })
})

const editOne = impl.edit.handler(async ({ input, context }) => {
  const updated = await updateComment(context.db, input.commentId, input.body)
  if (!updated) {
    throw localizedOrpcError(context, 'NOT_FOUND', 'comments.error.updateFailed')
  }
  recordAuditEventFromContext(context, {
    action: 'comment_updated',
    resourceType: 'comment',
    resourceId: input.commentId,
  })
  return { comment: asCommentItemWire(updated) }
})

const loadAll = impl.loadAll.handler(async ({ input, context }) => {
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

const searchPages = impl.searchPages.handler(async ({ input, context }) => {
  const keys = input.key ? [input.key] : undefined
  const pages = await searchPageOptions(context.db, input.q, input.limit, keys)
  return { pages }
})

const searchAuthors = impl.searchAuthors.handler(async ({ input, context }) => {
  function parseBigIntIds(raw: string | undefined): number[] | undefined {
    if (!raw || raw.length === 0) {
      return undefined
    }
    const out: number[] = []
    for (const value of raw.split(',')) {
      const trimmed = value.trim()
      if (!trimmed) {
        continue
      }
      try {
        out.push(idFromString(trimmed))
      } catch {}
    }
    return out.length > 0 ? out : undefined
  }
  const ids = parseBigIntIds(input.ids)
  const authors = await searchAuthorOptions(context.db, input.q, input.limit, ids)
  return { authors: authors.map((author) => ({ id: String(author.id), name: author.name })) }
})

const approveCommentDeletion = impl.approveCommentDeletion.handler(async ({ input, context }) => {
  await resolveCommentDeleteRequest(context.db, input.commentId, input.approve, context)
  return { success: true }
})

const listPendingDashboard = impl.listPendingDashboard.handler(async ({ input, context }) => {
  return loadAdminPendingDashboard(context.db, input.kind, input.offset ?? 0, input.limit ?? 20)
})

const pendingCount = impl.pendingCount.handler(async ({ context }) => {
  const counts = await countAdminPendingDashboard(context.db)
  return { all: counts.all }
})

const probeAvatarMirrors = impl.probeAvatarMirrors.handler(async () => {
  return { results: await probeAvatarMirrorUrls() }
})

export const adminCommentsRouter = impl.router({
  approve,
  delete: deleteOne,
  edit: editOne,
  loadAll,
  searchPages,
  searchAuthors,
  approveCommentDeletion,
  listPendingDashboard,
  pendingCount,
  probeAvatarMirrors,
})
