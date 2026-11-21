import { notificationsContract } from '@kobato/api/notifications'
import {
  getThread,
  listInbox,
  markRead,
  markUnread,
  replyToThread,
  unreadCount,
} from '@kobato/server/domains/notifications/service'
import { implementAuthed, notificationReplyRateLimit, resourceRateLimit } from '@kobato/server/http/orpc-base'

const impl = implementAuthed(notificationsContract)

const list = impl.list.handler(({ input, context }) =>
  listInbox(context.db, Number(context.viewer.id), {
    tab: input.tab,
    cursor: input.cursor !== undefined ? Number(input.cursor) : undefined,
    limit: input.limit,
    locale: context.localization.locale,
  }),
)

const unread = impl.unreadCount.handler(({ context }) => ({
  count: unreadCount(context.db, Number(context.viewer.id)),
}))

const markReadProc = impl.markRead.handler(({ input, context }) => {
  const userId = Number(context.viewer.id)
  markRead(
    context.db,
    userId,
    input.ids?.map((id) => Number(id)),
  )
  return { count: unreadCount(context.db, userId) }
})

const markUnreadProc = impl.markUnread.handler(({ input, context }) => {
  const userId = Number(context.viewer.id)
  markUnread(
    context.db,
    userId,
    input.ids.map((id) => Number(id)),
  )
  return { count: unreadCount(context.db, userId) }
})

const thread = impl.thread.handler(({ input, context }) =>
  getThread(context.db, context.viewer, Number(input.threadId), context.localization.locale),
)

const reply = impl
  .use(resourceRateLimit)
  .use(notificationReplyRateLimit)
  .reply.handler(async ({ input, context }) => {
    const result = await replyToThread(context.db, context.viewer, {
      threadId: Number(input.threadId),
      body: input.body,
    })
    return { message: result.message, threadId: String(result.threadId) }
  })

export const notificationsRouter = impl.router({
  list,
  unreadCount: unread,
  markRead: markReadProc,
  markUnread: markUnreadProc,
  thread,
  reply,
})
