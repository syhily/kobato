import {
  commentsMyCountsOutputSchema,
  commentsResolveEntityInputSchema,
  commentsResolveEntityOutputSchema,
  commentLoadMineInputSchema,
  commentLoadMineOutputSchema,
  commentSearchMineEntitiesInputSchema,
  commentSearchMineEntitiesOutputSchema,
} from '@kobato/api/contracts/account/comments'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const commentsAuthedContract = {
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
