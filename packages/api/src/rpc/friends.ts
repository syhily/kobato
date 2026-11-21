import { friendsApplyOutputSchema, applyFriendSchema } from '@kobato/api/contracts/friends'
import { oc } from '@orpc/contract'

export const friendsContract = {
  apply: oc.route({ method: 'POST', path: '/friends/apply' }).input(applyFriendSchema).output(friendsApplyOutputSchema),
}
