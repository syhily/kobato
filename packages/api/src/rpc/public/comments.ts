import {
  commentEditInputSchema,
  commentGetRawOutputSchema,
  commentListInputSchema,
  commentListOutputSchema,
  commentMyCommentsInputSchema,
  commentReplySchema,
  commentRevokeTokenInputSchema,
  commentRevokeTokenOutputSchema,
  commentRidSchema,
  myCommentsOutputSchema,
  ownCommentMutationDto,
  replyCommentOutputSchema,
} from '@kobato/api/contracts/comments'
import { oc } from '@orpc/contract'

export const commentsPublicContract = {
  replyComment: oc
    .route({ method: 'POST', path: '/comments/reply' })
    .input(commentReplySchema)
    .output(replyCommentOutputSchema),
  loadComments: oc
    .route({ method: 'GET', path: '/comments/list' })
    .input(commentListInputSchema)
    .output(commentListOutputSchema),
  getRaw: oc
    .route({ method: 'GET', path: '/comments/get-raw' })
    .input(commentRidSchema)
    .output(commentGetRawOutputSchema),
  edit: oc
    .route({ method: 'POST', path: '/comments/edit' })
    .input(commentEditInputSchema)
    .output(ownCommentMutationDto),
}

export const commentsTokenContract = {
  revokeToken: oc
    .route({ method: 'POST', path: '/comments/revoke-token' })
    .input(commentRevokeTokenInputSchema)
    .output(commentRevokeTokenOutputSchema),
  myComments: oc
    .route({ method: 'GET', path: '/comments/my-comments' })
    .input(commentMyCommentsInputSchema)
    .output(myCommentsOutputSchema),
}

export const commentsContract = {
  ...commentsPublicContract,
  ...commentsTokenContract,
}
