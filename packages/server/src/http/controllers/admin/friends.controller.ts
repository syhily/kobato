import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { friendIdSchema, listFriendsSchema, upsertFriendSchema } from '@kobato/server/domains/friends/schema'
import { deleteAdminFriend, listFriendsForAdmin, upsertAdminFriend } from '@kobato/server/domains/friends/service'
import { adminProc } from '@kobato/server/http/orpc-base'
import { adminFriendDto } from '@kobato/shared/contracts/friends'
import { idFromString } from '@kobato/shared/utils/id'
import { ORPCError } from '@orpc/server'
import { z } from 'zod'

const list = adminProc
  .route({ method: 'GET', path: '/admin/friends/list' })
  .input(listFriendsSchema)
  .output(z.object({ friends: z.array(adminFriendDto), total: z.number(), hasMore: z.boolean() }))
  .handler(({ input, context }) =>
    listFriendsForAdmin(context.db, {
      q: input.q,
      includeHidden: input.includeHidden,
      visible: input.visible,
      offset: input.offset,
      limit: input.limit,
    }),
  )

const upsert = adminProc
  .route({ method: 'POST', path: '/admin/friends/upsert' })
  .input(upsertFriendSchema)
  .output(z.object({ friend: adminFriendDto }))
  .handler(async ({ input, context }) => {
    const friend = await upsertAdminFriend(context.db, {
      id: input.id !== undefined ? idFromString(input.id) : undefined,
      website: input.website,
      description: input.description ?? null,
      homepage: input.homepage,
      poster: input.poster,
      rssUrl: input.rssUrl ?? null,
      visible: input.visible,
    })
    recordAuditEventFromContext(context, {
      action: input.id === undefined ? 'friend_created' : 'friend_updated',
      resourceType: 'friend',
      resourceId: String(friend.id),
    })
    return { friend }
  })

const remove = adminProc
  .route({ method: 'POST', path: '/admin/friends/remove' })
  .input(friendIdSchema)
  .output(z.void())
  .handler(async ({ input, context }) => {
    const ok = await deleteAdminFriend(context.db, idFromString(input.id))
    if (!ok) {
      throw new ORPCError('NOT_FOUND', { message: '友链不存在' })
    }
    recordAuditEventFromContext(context, {
      action: 'friend_deleted',
      resourceType: 'friend',
      resourceId: input.id,
    })
  })

export const adminFriendsRouter = { list, upsert, delete: remove }
