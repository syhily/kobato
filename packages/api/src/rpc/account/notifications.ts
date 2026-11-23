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
} from '@kobato/api/contracts/account/notifications'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const notificationsContract = {
  list: defineProcedure({ method: 'GET', path: '/notifications/list' })
    .input(listNotificationsInput)
    .output(listNotificationsOutput),
  unreadCount: defineProcedure({ method: 'GET', path: '/notifications/unread-count' }).output(unreadCountOutput),
  markRead: defineProcedure({ method: 'POST', path: '/notifications/mark-read' })
    .input(markNotificationsReadInput)
    .output(unreadCountOutput),
  markUnread: defineProcedure({ method: 'POST', path: '/notifications/mark-unread' })
    .input(markNotificationsUnreadInput)
    .output(unreadCountOutput),
  thread: defineProcedure({ method: 'GET', path: '/notifications/thread' })
    .input(notificationThreadInput)
    .output(notificationThreadOutput),
  reply: defineProcedure({ method: 'POST', path: '/notifications/reply' })
    .input(replyNotificationInput)
    .output(replyNotificationOutput),
}
