import { adminCommentsContract } from '@kobato/api/admin/comments.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { asAdminCommentsWire, asCommentItemWire } from '@kobato/server/domains/comments/projection.ts'
import {
  countAdminPendingDashboard,
  loadAdminPendingDashboard,
  loadAllComments,
  searchAuthorOptions,
  searchPageOptions,
} from '@kobato/server/domains/comments/services/admin-query.ts'
import { probeAvatarMirrors as probeAvatarMirrorUrls } from '@kobato/server/domains/comments/services/avatar.ts'
import {
  approveComment,
  deleteCommentById,
  resolveCommentDeleteRequest,
  updateComment,
} from '@kobato/server/domains/comments/services/moderate.ts'
import { implementAdmin, localizedOrpcError } from '@kobato/server/http/orpc-base.ts'
import { idFromString } from '@kobato/utils/id.ts'

// Contract-first: method/path/input/output live in
// `@kobato/api/admin/comments.ts` (the deployed `/comment-admin/*` surface);
// this controller only implements the procedures (admin base).
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

// Moderator edit: rewrites in place and never re-queues — the commenter-facing
// own-edit policy (grace window, delete fence, reply lock) is deliberately
// not applied here.
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
      } catch {
        // invalid id — skip
      }
    }
    return out.length > 0 ? out : undefined
  }
  const ids = parseBigIntIds(input.ids)
  const authors = await searchAuthorOptions(context.db, input.q, input.limit, ids)
  return { authors: authors.map((author) => ({ id: String(author.id), name: author.name })) }
})

const approveCommentDeletion = impl.approveCommentDeletion.handler(async ({ input, context }) => {
  // The delete-request state machine lives in the comments domain.
  await resolveCommentDeleteRequest(context.db, input.commentId, input.approve, context)
  return { success: true }
})

const listPendingDashboard = impl.listPendingDashboard.handler(async ({ input, context }) => {
  return loadAdminPendingDashboard(context.db, input.kind, input.offset ?? 0, input.limit ?? 20)
})

// Total pending rows for the admin layout's moderation badge — one count, no pagination.
const pendingCount = impl.pendingCount.handler(async ({ context }) => {
  const counts = await countAdminPendingDashboard(context.db)
  return { all: counts.all }
})

// Connectivity probe behind the settings avatar-mirror dropdown. Read-only,
// targets a fixed preset list — no audit event, no input.
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
