import { adminFriendsContract } from '@kobato/api/admin/friends.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { deleteAdminFriend, listFriendsForAdmin, upsertAdminFriend } from '@kobato/server/domains/friends/service.ts'
import { implementAdmin, localizedOrpcError } from '@kobato/server/http/orpc-base.ts'
import { idFromString } from '@kobato/utils/id.ts'

const impl = implementAdmin(adminFriendsContract)

const list = impl.list.handler(({ input, context }) =>
  listFriendsForAdmin(context.db, {
    q: input.q,
    includeHidden: input.includeHidden,
    visible: input.visible,
    offset: input.offset,
    limit: input.limit,
  }),
)

const upsert = impl.upsert.handler(async ({ input, context }) => {
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

const remove = impl.delete.handler(async ({ input, context }) => {
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

export const adminFriendsRouter = impl.router({ list, upsert, delete: remove })
