import {
  getThread,
  listInbox,
  markRead,
  markUnread,
  replyToThread,
  unreadCount,
} from '@/server/domains/notifications/service'
import { authedProc, resourceRateLimit } from '@/server/http/orpc-base'
import {
  listNotificationsInput,
  listNotificationsOutput,
  markNotificationsReadInput,
  markNotificationsUnreadInput,
  notificationThreadInput,
  notificationThreadOutput,
  replyNotificationInput,
  replyNotificationOutput,
  unreadCountOutput,
} from '@/shared/contracts/notifications'

const list = authedProc
  .route({ method: 'GET', path: '/notifications/list' })
  .input(listNotificationsInput)
  .output(listNotificationsOutput)
  .handler(({ input, context }) =>
    listInbox(context.db, Number(context.viewer.id), {
      tab: input.tab,
      cursor: input.cursor !== undefined ? Number(input.cursor) : undefined,
      limit: input.limit,
    }),
  )

const unread = authedProc
  .route({ method: 'GET', path: '/notifications/unread-count' })
  .output(unreadCountOutput)
  .handler(({ context }) => ({ count: unreadCount(context.db, Number(context.viewer.id)) }))

const markReadProc = authedProc
  .route({ method: 'POST', path: '/notifications/mark-read' })
  .input(markNotificationsReadInput)
  .output(unreadCountOutput)
  .handler(({ input, context }) => {
    const userId = Number(context.viewer.id)
    markRead(
      context.db,
      userId,
      input.ids?.map((id) => Number(id)),
    )
    return { count: unreadCount(context.db, userId) }
  })

const markUnreadProc = authedProc
  .route({ method: 'POST', path: '/notifications/mark-unread' })
  .input(markNotificationsUnreadInput)
  .output(unreadCountOutput)
  .handler(({ input, context }) => {
    const userId = Number(context.viewer.id)
    markUnread(
      context.db,
      userId,
      input.ids.map((id) => Number(id)),
    )
    return { count: unreadCount(context.db, userId) }
  })

const thread = authedProc
  .route({ method: 'GET', path: '/notifications/thread' })
  .input(notificationThreadInput)
  .output(notificationThreadOutput)
  .handler(({ input, context }) => getThread(context.db, context.viewer, Number(input.threadId)))

// Replies write to other users' inboxes — gate the per-IP resource bucket.
const reply = authedProc
  .use(resourceRateLimit)
  .route({ method: 'POST', path: '/notifications/reply' })
  .input(replyNotificationInput)
  .output(replyNotificationOutput)
  .handler(async ({ input, context }) => ({
    message: await replyToThread(context.db, context.viewer, {
      threadId: Number(input.threadId),
      body: input.body,
    }),
  }))

export const notificationsRouter = {
  list,
  unreadCount: unread,
  markRead: markReadProc,
  markUnread: markUnreadProc,
  thread,
  reply,
}
