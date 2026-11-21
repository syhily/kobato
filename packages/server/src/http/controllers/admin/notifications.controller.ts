import { adminNotificationsContract } from '@kobato/api/admin/notifications'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { recallMessage, sendBroadcast, sendDirectMessage } from '@kobato/server/domains/notifications/service'
import { implementAdmin } from '@kobato/server/http/orpc-base'

const impl = implementAdmin(adminNotificationsContract)

const sendDirect = impl.sendDirect.handler(({ input, context }) => {
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

const sendBroadcastProc = impl.sendBroadcast.handler(({ input, context }) => {
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

const recall = impl.recall.handler(({ input, context }) => {
  const result = recallMessage(context.db, Number(input.id))
  if (result.newlyRecalled) {
    recordAuditEventFromContext(context, {
      action: result.kind === 'broadcast' ? 'notification_broadcast_recalled' : 'notification_admin_recalled',
      resourceType: 'notification',
      resourceId: String(result.id),
    })
  }
  return { id: String(result.id), recalledAt: result.recalledAt.toISOString() }
})

export const adminNotificationsRouter = impl.router({ sendDirect, sendBroadcast: sendBroadcastProc, recall })
