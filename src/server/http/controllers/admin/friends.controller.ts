import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import { deleteAdminFriend, listFriendsForAdmin, upsertAdminFriend } from '@/server/domains/friends/service'
import { adminProc } from '@/server/http/orpc-base'
import { adminFriendDto } from '@/shared/contracts/friends'
import { idFromString } from '@/shared/utils/id'

const list = adminProc
  .route({ method: 'GET', path: '/admin/friends/list' })
  .input(
    z.object({
      q: z.string().optional(),
      includeHidden: z.boolean().optional(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    }),
  )
  .output(z.object({ friends: z.array(adminFriendDto), total: z.number(), hasMore: z.boolean() }))
  .handler(({ input, context }) =>
    listFriendsForAdmin(context.db, {
      q: input.q,
      includeHidden: input.includeHidden,
      offset: input.offset,
      limit: input.limit,
    }),
  )

const upsert = adminProc
  .route({ method: 'POST', path: '/admin/friends/upsert' })
  .input(
    z.object({
      id: z.string().min(1).optional(),
      website: z.string().trim().min(1).max(80),
      description: z.string().max(999).nullable().optional(),
      homepage: z.url().max(500),
      poster: z.url().max(500),
      rssUrl: z.union([z.url().max(500), z.literal(''), z.null()]).optional(),
      visible: z.boolean().optional().default(true),
    }),
  )
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
  .input(z.object({ id: z.string().min(1) }))
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
