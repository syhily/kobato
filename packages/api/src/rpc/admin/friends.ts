import {
  adminFriendUpsertOutputDto,
  adminFriendsListOutputDto,
  friendIdSchema,
  listFriendsSchema,
  upsertFriendSchema,
} from '@kobato/api/contracts/admin/friends'
import { voidOutput } from '@kobato/api/contracts/primitives'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminFriendsContract = {
  list: defineProcedure({ method: 'GET', path: '/admin/friends/list' })
    .input(listFriendsSchema)
    .output(adminFriendsListOutputDto),
  upsert: defineProcedure({ method: 'POST', path: '/admin/friends/upsert' })
    .input(upsertFriendSchema)
    .output(adminFriendUpsertOutputDto),
  delete: defineProcedure({ method: 'POST', path: '/admin/friends/remove' }).input(friendIdSchema).output(voidOutput),
}
