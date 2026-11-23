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
} from '@kobato/api/contracts/account/comments'
import { ownCommentMutationDto } from '@kobato/api/contracts/public/comments'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const commentsAuthedContract = {
  updateOwn: defineProcedure({ method: 'POST', path: '/comments/update-own' })
    .input(commentUpdateOwnInputSchema)
    .output(ownCommentMutationDto),
  requestDeleteOwn: defineProcedure({ method: 'POST', path: '/comments/request-delete-own' })
    .input(commentIdInputSchema)
    .output(ownCommentMutationDto),
  cancelDeleteOwn: defineProcedure({ method: 'POST', path: '/comments/cancel-delete-own' })
    .input(commentIdInputSchema)
    .output(ownCommentMutationDto),
  loadMine: defineProcedure({ method: 'GET', path: '/comments/load-mine' })
    .input(commentLoadMineInputSchema)
    .output(commentLoadMineOutputSchema),
  searchMineEntities: defineProcedure({ method: 'GET', path: '/comments/search-mine-entities' })
    .input(commentSearchMineEntitiesInputSchema)
    .output(commentSearchMineEntitiesOutputSchema),
  myCounts: defineProcedure({ method: 'GET', path: '/comments/my-counts' }).output(commentsMyCountsOutputSchema),
  resolveEntity: defineProcedure({ method: 'GET', path: '/comments/resolve-entity' })
    .input(commentsResolveEntityInputSchema)
    .output(commentsResolveEntityOutputSchema),
}
