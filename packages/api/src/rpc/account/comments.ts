import {
  commentsMyCountsOutputSchema,
  commentsResolveEntityInputSchema,
  commentsResolveEntityOutputSchema,
  commentIdInputSchema,
  commentLoadMineInputSchema,
  commentLoadMineOutputSchema,
  commentSearchMineEntitiesInputSchema,
  commentSearchMineEntitiesOutputSchema,
  commentUpdateOwnInputSchema,
  ownCommentMutationDto,
} from '@kobato/api/contracts/comments'
import { oc } from '@orpc/contract'

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
