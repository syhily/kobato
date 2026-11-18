import { friendsApplyOutputSchema, applyFriendSchema } from '@kobato/contracts/friends.ts'
import { oc } from '@orpc/contract'

// The friends RPC contract — the visitor-facing friend-link application.
export const friendsContract = {
  apply: oc.route({ method: 'POST', path: '/friends/apply' }).input(applyFriendSchema).output(friendsApplyOutputSchema),
}
