import { revisionContract } from '@kobato/api/admin/revision'
import { adminPostAnalyticsInputSchema, adminPostAnalyticsOutputSchema } from '@kobato/contracts/analytics'
import { contentRestoreResultDto } from '@kobato/contracts/content-admin-base'
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
} from '@kobato/contracts/posts'
import { voidOutput } from '@kobato/contracts/primitives'
import { oc } from '@orpc/contract'

export const adminPostsContract = {
  list: oc.route({ method: 'GET', path: '/admin/posts/list' }).input(listPostsSchema).output(listPostsOutputDto),
  get: oc.route({ method: 'GET', path: '/admin/posts/get' }).input(adminPostIdInput).output(adminPostDetailDto),
  delete: oc.route({ method: 'POST', path: '/admin/posts/remove' }).input(adminPostIdInput).output(voidOutput),
  restore: oc
    .route({ method: 'POST', path: '/admin/posts/restore' })
    .input(adminPostIdInput)
    .output(contentRestoreResultDto),
  unpublish: oc
    .route({ method: 'POST', path: '/admin/posts/unpublish' })
    .input(adminPostIdInput)
    .output(adminPostUnpublishOutputDto),
  ...revisionContract('/admin/posts'),
  upsertMeta: oc
    .route({ method: 'POST', path: '/admin/posts/upsert-meta' })
    .input(upsertPostMetaSchema)
    .output(adminPostUpsertMetaOutputDto),
  listRevisions: oc
    .route({ method: 'GET', path: '/admin/posts/list-revisions' })
    .input(adminPostIdInput)
    .output(listPostRevisionsOutputDto),
  mySummary: oc.route({ method: 'GET', path: '/admin/posts/my-summary' }).output(adminPostsMySummaryOutputSchema),
  analytics: oc
    .route({ method: 'GET', path: '/admin/posts/analytics' })
    .input(adminPostAnalyticsInputSchema)
    .output(adminPostAnalyticsOutputSchema),
}
