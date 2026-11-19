import { adminWebmentionsContract } from '@kobato/api/admin/webmentions.ts'
import { countWebmentions } from '@kobato/db/operations/webmention.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { asAdminWebmentionWire } from '@kobato/server/domains/webmentions/projection.ts'
import { reverifyWebmention } from '@kobato/server/domains/webmentions/reverify.ts'
import {
  approveWebmention,
  listAdminWebmentionOutbox,
  listAdminWebmentions,
  rejectWebmention,
} from '@kobato/server/domains/webmentions/service.ts'
import { implementAdmin } from '@kobato/server/http/orpc-base.ts'

const impl = implementAdmin(adminWebmentionsContract)

const loadAll = impl.loadAll.handler(async ({ input, context }) => {
  return listAdminWebmentions(context.db, input)
})

const approve = impl.approve.handler(async ({ input, context }) => {
  await approveWebmention(context.db, input.id)
  recordAuditEventFromContext(context, {
    action: 'webmention_approved',
    resourceType: 'webmention',
    resourceId: input.id,
  })
})

const reject = impl.reject.handler(async ({ input, context }) => {
  await rejectWebmention(context.db, input.id)
  recordAuditEventFromContext(context, {
    action: 'webmention_rejected',
    resourceType: 'webmention',
    resourceId: input.id,
  })
})

const reverify = impl.reverify.handler(async ({ input, context }) => {
  const row = await reverifyWebmention(context.db, input.id)
  recordAuditEventFromContext(context, {
    action: 'webmention_verified',
    resourceType: 'webmention',
    resourceId: input.id,
  })
  return asAdminWebmentionWire(row)
})

const outbox = impl.outbox.handler(async ({ input, context }) => {
  return listAdminWebmentionOutbox(context.db, input)
})

const pendingCount = impl.pendingCount.handler(({ context }) => countWebmentions(context.db, 'pending'))

export const adminWebmentionsRouter = impl.router({
  loadAll,
  approve,
  reject,
  reverify,
  outbox,
  pendingCount,
})
