import { friendsApplyOutputSchema, applyFriendSchema } from '@kobato/api/contracts/public/friends'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const friendsContract = {
  apply: defineProcedure({ method: 'POST', path: '/friends/apply' })
    .input(applyFriendSchema)
    .output(friendsApplyOutputSchema),
}
