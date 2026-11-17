import { adminWebmentionsPendingCountOutputSchema } from '@kobato/contracts/admin.ts'
import {
  adminWebmentionDto,
  adminWebmentionOutboxDto,
  webmentionOutboxStatusCountsSchema,
  webmentionStatusCountsSchema,
} from '@kobato/contracts/webmentions.ts'
import { countWebmentions } from '@kobato/db/operations/webmention.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { asAdminWebmentionWire } from '@kobato/server/domains/webmentions/projection.ts'
import { reverifyWebmention } from '@kobato/server/domains/webmentions/reverify.ts'
import {
  adminWebmentionListSchema,
  adminWebmentionOutboxListSchema,
} from '@kobato/server/domains/webmentions/schema.ts'
import {
  approveWebmention,
  listAdminWebmentionOutbox,
  listAdminWebmentions,
  rejectWebmention,
} from '@kobato/server/domains/webmentions/service.ts'
import { adminProc } from '@kobato/server/http/orpc-base.ts'
import { z } from 'zod'

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
