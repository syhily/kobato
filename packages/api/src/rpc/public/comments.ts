import {
  commentEditInputSchema,
  commentGetRawOutputSchema,
  commentIdInputSchema,
  commentListInputSchema,
  commentListOutputSchema,
  commentMyCommentsInputSchema,
  commentReplySchema,
  commentRevokeTokenInputSchema,
  commentRevokeTokenOutputSchema,
  commentRidSchema,
  commentUpdateOwnInputSchema,
  myCommentsOutputSchema,
  ownCommentMutationDto,
  replyCommentOutputSchema,
} from '@kobato/api/contracts/public/comments'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const commentsPublicContract = {
  replyComment: defineProcedure({ method: 'POST', path: '/comments/reply' })
    .input(commentReplySchema)
    .output(replyCommentOutputSchema),
  loadComments: defineProcedure({ method: 'GET', path: '/comments/list' }, { publicRead: true })
    .input(commentListInputSchema)
    .output(commentListOutputSchema),
  getRaw: defineProcedure({ method: 'GET', path: '/comments/get-raw' })
    .input(commentRidSchema)
    .output(commentGetRawOutputSchema),
  edit: defineProcedure({ method: 'POST', path: '/comments/edit' })
    .input(commentEditInputSchema)
    .output(ownCommentMutationDto),
}

export const commentsOwnContract = {
  updateOwn: defineProcedure({ method: 'POST', path: '/comments/update-own' })
    .input(commentUpdateOwnInputSchema)
    .output(ownCommentMutationDto),
  requestDeleteOwn: defineProcedure({ method: 'POST', path: '/comments/request-delete-own' })
    .input(commentIdInputSchema)
    .output(ownCommentMutationDto),
  cancelDeleteOwn: defineProcedure({ method: 'POST', path: '/comments/cancel-delete-own' })
    .input(commentIdInputSchema)
    .output(ownCommentMutationDto),
}

export const commentsTokenContract = {
  revokeToken: defineProcedure({ method: 'POST', path: '/comments/revoke-token' })
    .input(commentRevokeTokenInputSchema)
    .output(commentRevokeTokenOutputSchema),
  myComments: defineProcedure({ method: 'GET', path: '/comments/my-comments' })
    .input(commentMyCommentsInputSchema)
    .output(myCommentsOutputSchema),
}

export const commentsContract = {
  ...commentsPublicContract,
  ...commentsOwnContract,
  ...commentsTokenContract,
}
