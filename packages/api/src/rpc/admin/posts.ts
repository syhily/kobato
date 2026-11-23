import { adminPostAnalyticsInputSchema, adminPostAnalyticsOutputSchema } from '@kobato/api/contracts/admin/analytics'
import { contentRestoreResultDto } from '@kobato/api/contracts/admin/content-admin-base'
import {
  adminPostsMySummaryOutputSchema,
  adminPostDetailDto,
  adminPostIdInput,
  adminPostUnpublishOutputDto,
  adminPostUpsertMetaOutputDto,
  listPostRevisionsOutputDto,
  listPostsOutputDto,
  listPostsSchema,
  upsertPostMetaSchema,
} from '@kobato/api/contracts/admin/posts'
import { voidOutput } from '@kobato/api/contracts/primitives'
import { revisionContract } from '@kobato/api/rpc/admin/revision'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminPostsContract = {
  list: defineProcedure({ method: 'GET', path: '/admin/posts/list' }).input(listPostsSchema).output(listPostsOutputDto),
  get: defineProcedure({ method: 'GET', path: '/admin/posts/get' }).input(adminPostIdInput).output(adminPostDetailDto),
  delete: defineProcedure({ method: 'POST', path: '/admin/posts/remove' }).input(adminPostIdInput).output(voidOutput),
  restore: defineProcedure({ method: 'POST', path: '/admin/posts/restore' })
    .input(adminPostIdInput)
    .output(contentRestoreResultDto),
  unpublish: defineProcedure({ method: 'POST', path: '/admin/posts/unpublish' })
    .input(adminPostIdInput)
    .output(adminPostUnpublishOutputDto),
  ...revisionContract('/admin/posts'),
  upsertMeta: defineProcedure({ method: 'POST', path: '/admin/posts/upsert-meta' })
    .input(upsertPostMetaSchema)
    .output(adminPostUpsertMetaOutputDto),
  listRevisions: defineProcedure({ method: 'GET', path: '/admin/posts/list-revisions' })
    .input(adminPostIdInput)
    .output(listPostRevisionsOutputDto),
  mySummary: defineProcedure({ method: 'GET', path: '/admin/posts/my-summary' }).output(
    adminPostsMySummaryOutputSchema,
  ),
  analytics: defineProcedure({ method: 'GET', path: '/admin/posts/analytics' })
    .input(adminPostAnalyticsInputSchema)
    .output(adminPostAnalyticsOutputSchema),
}
