import {
  adminFriendUpsertOutputDto,
  adminFriendsListOutputDto,
  friendIdSchema,
  listFriendsSchema,
  upsertFriendSchema,
} from '@kobato/contracts/friends'
import { voidOutput } from '@kobato/contracts/primitives'
import { oc } from '@orpc/contract'

export const adminFriendsContract = {
  list: oc
    .route({ method: 'GET', path: '/admin/friends/list' })
    .input(listFriendsSchema)
    .output(adminFriendsListOutputDto),
  upsert: oc
    .route({ method: 'POST', path: '/admin/friends/upsert' })
    .input(upsertFriendSchema)
    .output(adminFriendUpsertOutputDto),
  delete: oc.route({ method: 'POST', path: '/admin/friends/remove' }).input(friendIdSchema).output(voidOutput),
}
