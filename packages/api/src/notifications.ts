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
} from '@kobato/contracts/notifications.ts'
import { oc } from '@orpc/contract'

// The notifications RPC contract — the signed-in message center.
export const notificationsContract = {
  list: oc
    .route({ method: 'GET', path: '/notifications/list' })
    .input(listNotificationsInput)
    .output(listNotificationsOutput),
  unreadCount: oc.route({ method: 'GET', path: '/notifications/unread-count' }).output(unreadCountOutput),
  markRead: oc
    .route({ method: 'POST', path: '/notifications/mark-read' })
    .input(markNotificationsReadInput)
    .output(unreadCountOutput),
  markUnread: oc
    .route({ method: 'POST', path: '/notifications/mark-unread' })
    .input(markNotificationsUnreadInput)
    .output(unreadCountOutput),
  thread: oc
    .route({ method: 'GET', path: '/notifications/thread' })
    .input(notificationThreadInput)
    .output(notificationThreadOutput),
  reply: oc
    .route({ method: 'POST', path: '/notifications/reply' })
    .input(replyNotificationInput)
    .output(replyNotificationOutput),
}
