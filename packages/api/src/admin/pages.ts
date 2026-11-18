import { revisionContract } from '@kobato/api/admin/revision.ts'
import { contentRestoreResultDto } from '@kobato/contracts/content-admin-base.ts'
import {
  adminPageDetailDto,
  adminPageIdInput,
  adminPageUnpublishOutputDto,
  adminPageUpsertMetaOutputDto,
  listPageRevisionsOutputDto,
  listPagesOutputDto,
  listPagesSchema,
  upsertPageMetaSchema,
} from '@kobato/contracts/pages.ts'
import { voidOutput } from '@kobato/contracts/primitives.ts'
import { oc } from '@orpc/contract'

// Admin pages RPC contract — admin base on the server.
export const adminPagesContract = {
  list: oc.route({ method: 'GET', path: '/admin/pages/list' }).input(listPagesSchema).output(listPagesOutputDto),
  get: oc.route({ method: 'GET', path: '/admin/pages/get' }).input(adminPageIdInput).output(adminPageDetailDto),
  delete: oc.route({ method: 'POST', path: '/admin/pages/remove' }).input(adminPageIdInput).output(voidOutput),
  restore: oc
    .route({ method: 'POST', path: '/admin/pages/restore' })
    .input(adminPageIdInput)
    .output(contentRestoreResultDto),
  unpublish: oc
    .route({ method: 'POST', path: '/admin/pages/unpublish' })
    .input(adminPageIdInput)
    .output(adminPageUnpublishOutputDto),
  ...revisionContract('/admin/pages'),
  upsertMeta: oc
    .route({ method: 'POST', path: '/admin/pages/upsert-meta' })
    .input(upsertPageMetaSchema)
    .output(adminPageUpsertMetaOutputDto),
  listRevisions: oc
    .route({ method: 'GET', path: '/admin/pages/list-revisions' })
    .input(adminPageIdInput)
    .output(listPageRevisionsOutputDto),
}
