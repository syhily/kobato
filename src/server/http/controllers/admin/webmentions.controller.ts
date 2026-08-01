import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { adminWebmentionListSchema, adminWebmentionOutboxListSchema } from '@/server/domains/webmentions/schema'
import {
  approveWebmention,
  listAdminWebmentionOutbox,
  listAdminWebmentions,
  rejectWebmention,
} from '@/server/domains/webmentions/service'
import { adminProc } from '@/server/http/orpc-base'
import { adminWebmentionDto, adminWebmentionOutboxDto } from '@/shared/contracts/webmentions'

const loadAll = adminProc
  .route({ method: 'GET', path: '/webmention-admin/load-all' })
  .input(adminWebmentionListSchema)
  .output(
    z.object({
      mentions: z.array(adminWebmentionDto),
      total: z.number().int(),
      hasMore: z.boolean(),
      statusCounts: z.object({
        all: z.number().int(),
        pending: z.number().int(),
        approved: z.number().int(),
        rejected: z.number().int(),
      }),
    }),
  )
  .handler(async ({ input, context }) => {
    return listAdminWebmentions(context.db, input)
  })

const approve = adminProc
  .route({ method: 'POST', path: '/webmention-admin/approve' })
  .input(z.object({ id: z.string() }))
  .output(z.void())
  .handler(async ({ input, context }) => {
    await approveWebmention(context.db, input.id)
    recordAuditEventFromContext(context, {
      action: 'webmention_approved',
      resourceType: 'webmention',
      resourceId: input.id,
    })
  })

const reject = adminProc
  .route({ method: 'POST', path: '/webmention-admin/reject' })
  .input(z.object({ id: z.string() }))
  .output(z.void())
  .handler(async ({ input, context }) => {
    await rejectWebmention(context.db, input.id)
    recordAuditEventFromContext(context, {
      action: 'webmention_rejected',
      resourceType: 'webmention',
      resourceId: input.id,
    })
  })

// The outbound send log, read-only: no mutations here on purpose — a
// retry is a republish (the upsert resets terminal rows), and rows are
// never deleted from the admin shell.
const outbox = adminProc
  .route({ method: 'GET', path: '/webmention-admin/outbox' })
  .input(adminWebmentionOutboxListSchema)
  .output(
    z.object({
      rows: z.array(adminWebmentionOutboxDto),
      total: z.number().int(),
      hasMore: z.boolean(),
      statusCounts: z.object({
        all: z.number().int(),
        pending: z.number().int(),
        sent: z.number().int(),
        'no-endpoint': z.number().int(),
        failed: z.number().int(),
      }),
    }),
  )
  .handler(async ({ input, context }) => {
    return listAdminWebmentionOutbox(context.db, input)
  })

export const adminWebmentionsRouter = {
  loadAll,
  approve,
  reject,
  outbox,
}
