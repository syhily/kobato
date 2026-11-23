import {
  adminWebmentionsPendingCountOutputSchema,
  adminWebmentionDto,
  adminWebmentionIdInput,
  adminWebmentionListSchema,
  adminWebmentionOutboxListSchema,
  adminWebmentionOutboxOutputDto,
  adminWebmentionsLoadAllOutputDto,
} from '@kobato/api/contracts/admin/webmentions'
import { voidOutput } from '@kobato/api/contracts/primitives'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminWebmentionsContract = {
  loadAll: defineProcedure({ method: 'GET', path: '/admin/webmentions/load-all' })
    .input(adminWebmentionListSchema)
    .output(adminWebmentionsLoadAllOutputDto),
  approve: defineProcedure({ method: 'POST', path: '/admin/webmentions/approve' })
    .input(adminWebmentionIdInput)
    .output(voidOutput),
  reject: defineProcedure({ method: 'POST', path: '/admin/webmentions/reject' })
    .input(adminWebmentionIdInput)
    .output(voidOutput),
  reverify: defineProcedure({ method: 'POST', path: '/admin/webmentions/reverify' })
    .input(adminWebmentionIdInput)
    .output(adminWebmentionDto),
  outbox: defineProcedure({ method: 'GET', path: '/admin/webmentions/outbox' })
    .input(adminWebmentionOutboxListSchema)
    .output(adminWebmentionOutboxOutputDto),
  pendingCount: defineProcedure({ method: 'GET', path: '/admin/webmentions/pending-count' }).output(
    adminWebmentionsPendingCountOutputSchema,
  ),
}
