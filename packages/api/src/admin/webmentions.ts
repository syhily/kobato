import { voidOutput } from '@kobato/contracts/primitives.ts'
import {
  adminWebmentionsPendingCountOutputSchema,
  adminWebmentionDto,
  adminWebmentionIdInput,
  adminWebmentionListSchema,
  adminWebmentionOutboxListSchema,
  adminWebmentionOutboxOutputDto,
  adminWebmentionsLoadAllOutputDto,
} from '@kobato/contracts/webmentions.ts'
import { oc } from '@orpc/contract'

// Admin webmention moderation RPC contract — admin base on the server. The
// deployed paths are the legacy `/webmention-admin/*` surface (not
// `/admin/webmentions/*`) and must never drift.
export const adminWebmentionsContract = {
  loadAll: oc
    .route({ method: 'GET', path: '/webmention-admin/load-all' })
    .input(adminWebmentionListSchema)
    .output(adminWebmentionsLoadAllOutputDto),
  approve: oc
    .route({ method: 'POST', path: '/webmention-admin/approve' })
    .input(adminWebmentionIdInput)
    .output(voidOutput),
  reject: oc
    .route({ method: 'POST', path: '/webmention-admin/reject' })
    .input(adminWebmentionIdInput)
    .output(voidOutput),
  reverify: oc
    .route({ method: 'POST', path: '/webmention-admin/reverify' })
    .input(adminWebmentionIdInput)
    .output(adminWebmentionDto),
  outbox: oc
    .route({ method: 'GET', path: '/webmention-admin/outbox' })
    .input(adminWebmentionOutboxListSchema)
    .output(adminWebmentionOutboxOutputDto),
  pendingCount: oc
    .route({ method: 'GET', path: '/webmention-admin/pending-count' })
    .output(adminWebmentionsPendingCountOutputSchema),
}
