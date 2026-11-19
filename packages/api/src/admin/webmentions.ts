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

export const adminWebmentionsContract = {
  loadAll: oc
    .route({ method: 'GET', path: '/admin/webmentions/load-all' })
    .input(adminWebmentionListSchema)
    .output(adminWebmentionsLoadAllOutputDto),
  approve: oc
    .route({ method: 'POST', path: '/admin/webmentions/approve' })
    .input(adminWebmentionIdInput)
    .output(voidOutput),
  reject: oc
    .route({ method: 'POST', path: '/admin/webmentions/reject' })
    .input(adminWebmentionIdInput)
    .output(voidOutput),
  reverify: oc
    .route({ method: 'POST', path: '/admin/webmentions/reverify' })
    .input(adminWebmentionIdInput)
    .output(adminWebmentionDto),
  outbox: oc
    .route({ method: 'GET', path: '/admin/webmentions/outbox' })
    .input(adminWebmentionOutboxListSchema)
    .output(adminWebmentionOutboxOutputDto),
  pendingCount: oc
    .route({ method: 'GET', path: '/admin/webmentions/pending-count' })
    .output(adminWebmentionsPendingCountOutputSchema),
}
