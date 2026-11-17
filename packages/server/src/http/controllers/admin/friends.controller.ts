import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { friendIdSchema, listFriendsSchema, upsertFriendSchema } from '@kobato/server/domains/friends/schema.ts'
import { deleteAdminFriend, listFriendsForAdmin, upsertAdminFriend } from '@kobato/server/domains/friends/service.ts'
import { adminProc, localizedOrpcError } from '@kobato/server/http/orpc-base.ts'
import { adminFriendDto } from '@kobato/shared/contracts/friends.ts'
import { idFromString } from '@kobato/shared/utils/id.ts'
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
      resourceId: friend.id,
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
      throw localizedOrpcError(context, 'NOT_FOUND', 'friends.error.notFound')
    }
    recordAuditEventFromContext(context, {
      action: 'friend_deleted',
      resourceType: 'friend',
      resourceId: input.id,
    })
  })

export const adminFriendsRouter = { list, upsert, delete: remove }
