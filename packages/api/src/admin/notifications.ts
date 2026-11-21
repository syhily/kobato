import {
  adminRecallNotificationInput,
  adminRecallNotificationOutput,
  adminSendBroadcastInput,
  adminSendDirectInput,
  adminSendOutput,
} from '@kobato/contracts/notifications'
import { oc } from '@orpc/contract'

export const adminNotificationsContract = {
  sendDirect: oc
    .route({ method: 'POST', path: '/admin/notifications/send-direct' })
    .input(adminSendDirectInput)
    .output(adminSendOutput),
  sendBroadcast: oc
    .route({ method: 'POST', path: '/admin/notifications/send-broadcast' })
    .input(adminSendBroadcastInput)
    .output(adminSendOutput),
  recall: oc
    .route({ method: 'POST', path: '/admin/notifications/recall' })
    .input(adminRecallNotificationInput)
    .output(adminRecallNotificationOutput),
}
