import {
  adminRecallNotificationInput,
  adminRecallNotificationOutput,
  adminSendBroadcastInput,
  adminSendDirectInput,
  adminSendOutput,
} from '@kobato/api/contracts/admin/notifications'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminNotificationsContract = {
  sendDirect: defineProcedure({ method: 'POST', path: '/admin/notifications/send-direct' })
    .input(adminSendDirectInput)
    .output(adminSendOutput),
  sendBroadcast: defineProcedure({ method: 'POST', path: '/admin/notifications/send-broadcast' })
    .input(adminSendBroadcastInput)
    .output(adminSendOutput),
  recall: defineProcedure({ method: 'POST', path: '/admin/notifications/recall' })
    .input(adminRecallNotificationInput)
    .output(adminRecallNotificationOutput),
}
