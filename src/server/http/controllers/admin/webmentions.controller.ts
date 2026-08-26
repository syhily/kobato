import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { asAdminWebmentionWire } from '@/server/domains/webmentions/projection'
import { reverifyWebmention } from '@/server/domains/webmentions/reverify'
import { adminWebmentionListSchema, adminWebmentionOutboxListSchema } from '@/server/domains/webmentions/schema'
import {
  approveWebmention,
  listAdminWebmentionOutbox,
  listAdminWebmentions,
  rejectWebmention,
} from '@/server/domains/webmentions/service'
import { adminProc } from '@/server/http/orpc-base'
import { countWebmentions } from '@/server/infra/db/operations/webmention'
import { adminWebmentionsPendingCountOutputSchema } from '@/shared/contracts/admin'
import {
  adminWebmentionDto,
  adminWebmentionOutboxDto,
  webmentionOutboxStatusCountsSchema,
  webmentionStatusCountsSchema,
} from '@/shared/contracts/webmentions'

const loadAll = adminProc
  .route({ method: 'GET', path: '/webmention-admin/load-all' })
  .input(adminWebmentionListSchema)
  .output(
    z.object({
      mentions: z.array(adminWebmentionDto),
      total: z.number().int(),
      hasMore: z.boolean(),
      statusCounts: webmentionStatusCountsSchema,
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

// Manual re-verification — the ONLY recovery path for a `hidden` mention;
// success restores it, failure records the message. Returns the refreshed row.
const reverify = adminProc
  .route({ method: 'POST', path: '/webmention-admin/reverify' })
  .input(z.object({ id: z.string() }))
  .output(adminWebmentionDto)
  .handler(async ({ input, context }) => {
    const row = await reverifyWebmention(context.db, input.id)
    recordAuditEventFromContext(context, {
      action: 'webmention_verified',
      resourceType: 'webmention',
      resourceId: input.id,
    })
    return asAdminWebmentionWire(row)
  })

// Outbound send log, read-only: retry = republish (upsert resets terminal rows); never deleted.
const outbox = adminProc
  .route({ method: 'GET', path: '/webmention-admin/outbox' })
  .input(adminWebmentionOutboxListSchema)
  .output(
    z.object({
      rows: z.array(adminWebmentionOutboxDto),
      total: z.number().int(),
      hasMore: z.boolean(),
      statusCounts: webmentionOutboxStatusCountsSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    return listAdminWebmentionOutbox(context.db, input)
  })

// Pending mention count for the admin layout's badge — one `count(*)`.
const pendingCount = adminProc
  .route({ method: 'GET', path: '/webmention-admin/pending-count' })
  .output(adminWebmentionsPendingCountOutputSchema)
  .handler(({ context }) => countWebmentions(context.db, 'pending'))

export const adminWebmentionsRouter = {
  loadAll,
  approve,
  reject,
  reverify,
  outbox,
  pendingCount,
}
