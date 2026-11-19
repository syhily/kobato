import { friendsApplyOutputSchema, applyFriendSchema } from '@kobato/contracts/friends.ts'
import { oc } from '@orpc/contract'

export const friendsContract = {
  apply: oc.route({ method: 'POST', path: '/friends/apply' }).input(applyFriendSchema).output(friendsApplyOutputSchema),
}
