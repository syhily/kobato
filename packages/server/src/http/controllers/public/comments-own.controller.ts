import { commentsOwnContract } from '@kobato/api/rpc/public/comments'
import { asCommentItemWire } from '@kobato/server/domains/comments/projection'
import {
  cancelOwnCommentDeletion,
  editOwnComment,
  requestOwnCommentDeletion,
} from '@kobato/server/domains/comments/services/moderate'
import { implementAuthed, localizedOrpcError } from '@kobato/server/http/orpc-base'
import { idFromString } from '@kobato/utils/id'

const impl = implementAuthed(commentsOwnContract)

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

export const commentsOwnRouter = impl.router({
  updateOwn,
  requestDeleteOwn,
  cancelDeleteOwn,
})
