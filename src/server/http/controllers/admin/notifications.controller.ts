import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { sendBroadcast, sendDirectMessage } from '@/server/domains/notifications/service'
import { adminProc } from '@/server/http/orpc-base'
import { adminSendBroadcastInput, adminSendDirectInput, adminSendOutput } from '@/shared/contracts/notifications'

const sendDirect = adminProc
  .route({ method: 'POST', path: '/admin/notifications/send-direct' })
  .input(adminSendDirectInput)
  .output(adminSendOutput)
  .handler(({ input, context }) => {
    const row = sendDirectMessage(context.db, Number(context.viewer.id), Number(input.userId), {
      title: input.title,
      body: input.body,
    })
    recordAuditEventFromContext(context, {
      action: 'notification_direct_created',
      resourceType: 'notification',
      resourceId: String(row.id),
    })
    return { id: String(row.id) }
  })

const sendBroadcastProc = adminProc
  .route({ method: 'POST', path: '/admin/notifications/send-broadcast' })
  .input(adminSendBroadcastInput)
  .output(adminSendOutput)
  .handler(({ input, context }) => {
    const row = sendBroadcast(context.db, Number(context.viewer.id), {
      title: input.title,
      body: input.body,
      replyable: input.replyable,
    })
    recordAuditEventFromContext(context, {
      action: 'notification_broadcast_created',
      resourceType: 'notification',
      resourceId: String(row.id),
    })
    return { id: String(row.id) }
  })

export const adminNotificationsRouter = { sendDirect, sendBroadcast: sendBroadcastProc }
