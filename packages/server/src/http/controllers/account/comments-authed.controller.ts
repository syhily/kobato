import { parseCommentEntity, serializeCommentEntity } from '@kobato/api/contracts/public/comments'
import { commentsAuthedContract } from '@kobato/api/rpc/account/comments'
import { resolveEntitiesForComments } from '@kobato/db/sqlite/operations/content/entity-asset'
import { asCommentItemWire } from '@kobato/server/domains/comments/projection'
import {
  countMyComments,
  listMyCommentEntities,
  loadMineCommentsPage,
} from '@kobato/server/domains/comments/services/mine-comments'
import {
  cancelOwnCommentDeletion,
  editOwnComment,
  requestOwnCommentDeletion,
} from '@kobato/server/domains/comments/services/moderate'
import { implementAuthed, localizedOrpcError } from '@kobato/server/http/orpc-base'
import { idFromString } from '@kobato/utils/id'

const impl = implementAuthed(commentsAuthedContract)

const updateOwn = impl.updateOwn.handler(async ({ input, context }) => {
  const commentId = input.commentId ? idFromString(input.commentId) : 0
  if (commentId === 0) {
    throw localizedOrpcError(context, 'BAD_REQUEST', 'comments.error.commentIdRequired')
  }
  const updated = await editOwnComment(context.db, input.commentId, input.body, context.viewer, context)
  return { comment: asCommentItemWire(updated) }
})

const requestDeleteOwn = impl.requestDeleteOwn.handler(async ({ input, context }) => {
  const updated = await requestOwnCommentDeletion(context.db, input.commentId, context.viewer, context)
  return { comment: asCommentItemWire(updated) }
})

const cancelDeleteOwn = impl.cancelDeleteOwn.handler(async ({ input, context }) => {
  const updated = await cancelOwnCommentDeletion(context.db, input.commentId, context.viewer, context)
  return { comment: asCommentItemWire(updated) }
})

const loadMine = impl.loadMine.handler(async ({ input, context }) => {
  const userId = idFromString(context.viewer.id)
  const entity = input.entity ? parseCommentEntity(input.entity) : null
  const filters = {
    status: input.status,
    q: input.q,
    entity: entity ?? undefined,
  }
  return loadMineCommentsPage(context.db, userId, input.offset, Math.min(input.limit, 100), filters)
})

const searchMineEntities = impl.searchMineEntities.handler(async ({ input, context }) => {
  const userId = idFromString(context.viewer.id)
  const rows = await listMyCommentEntities(context.db, userId, { q: input.q })
  return {
    entities: rows.map((e) => ({
      value: serializeCommentEntity({ type: e.type, ownerId: e.ownerId }),
      label: e.title,
    })),
  }
})

const myCounts = impl.myCounts.handler(async ({ context }) =>
  countMyComments(context.db, idFromString(context.viewer.id)),
)

const resolveEntity = impl.resolveEntity.handler(async ({ input, context }) => {
  const parsed = parseCommentEntity(input.entity)
  if (parsed === null) {
    return null
  }
  const resolved = await resolveEntitiesForComments(context.db, [parsed])
  const hit = resolved.get(serializeCommentEntity(parsed))
  return hit === undefined ? null : { value: serializeCommentEntity(parsed), label: hit.title }
})

export const commentsAuthedRouter = impl.router({
  updateOwn,
  requestDeleteOwn,
  cancelDeleteOwn,
  loadMine,
  searchMineEntities,
  myCounts,
  resolveEntity,
})
