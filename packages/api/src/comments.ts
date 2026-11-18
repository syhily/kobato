import {
  commentsMyCountsOutputSchema,
  commentsResolveEntityInputSchema,
  commentsResolveEntityOutputSchema,
} from '@kobato/contracts/admin.ts'
import {
  commentEditInputSchema,
  commentGetRawOutputSchema,
  commentIdInputSchema,
  commentListInputSchema,
  commentListOutputSchema,
  commentLoadMineInputSchema,
  commentLoadMineOutputSchema,
  commentMyCommentsInputSchema,
  commentReplySchema,
  commentRevokeTokenInputSchema,
  commentRevokeTokenOutputSchema,
  commentRidSchema,
  commentSearchMineEntitiesInputSchema,
  commentSearchMineEntitiesOutputSchema,
  commentUpdateOwnInputSchema,
  myCommentsOutputSchema,
  ownCommentMutationDto,
  replyCommentOutputSchema,
} from '@kobato/contracts/comments.ts'
import { oc } from '@orpc/contract'

// The comments RPC contract, split by controller surface the same way the
// server splits its controllers; `commentsContract` composes the merged
// `apiRouter.comments` shape. Route paths are the deployed surface.

// `controllers/comments-public.controller.ts` — anonymous + token-authorized edits.
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

// `controllers/comments-authed.controller.ts` — the signed-in own-comment family.
export const commentsAuthedContract = {
  updateOwn: oc
    .route({ method: 'POST', path: '/comments/update-own' })
    .input(commentUpdateOwnInputSchema)
    .output(ownCommentMutationDto),
  requestDeleteOwn: oc
    .route({ method: 'POST', path: '/comments/request-delete-own' })
    .input(commentIdInputSchema)
    .output(ownCommentMutationDto),
  cancelDeleteOwn: oc
    .route({ method: 'POST', path: '/comments/cancel-delete-own' })
    .input(commentIdInputSchema)
    .output(ownCommentMutationDto),
  loadMine: oc
    .route({ method: 'GET', path: '/comments/load-mine' })
    .input(commentLoadMineInputSchema)
    .output(commentLoadMineOutputSchema),
  searchMineEntities: oc
    .route({ method: 'GET', path: '/comments/search-mine-entities' })
    .input(commentSearchMineEntitiesInputSchema)
    .output(commentSearchMineEntitiesOutputSchema),
  myCounts: oc.route({ method: 'GET', path: '/comments/my-counts' }).output(commentsMyCountsOutputSchema),
  resolveEntity: oc
    .route({ method: 'GET', path: '/comments/resolve-entity' })
    .input(commentsResolveEntityInputSchema)
    .output(commentsResolveEntityOutputSchema),
}

// `controllers/comments-token.controller.ts` — the `__comment_tokens` cookie surface.
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
  ...commentsAuthedContract,
  ...commentsTokenContract,
}
