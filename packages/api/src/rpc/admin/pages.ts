import { contentRestoreResultDto } from '@kobato/api/contracts/content-admin-base'
import {
  adminPageDetailDto,
  adminPageIdInput,
  adminPageUnpublishOutputDto,
  adminPageUpsertMetaOutputDto,
  listPageRevisionsOutputDto,
  listPagesOutputDto,
  listPagesSchema,
  upsertPageMetaSchema,
} from '@kobato/api/contracts/pages'
import { voidOutput } from '@kobato/api/contracts/primitives'
import { revisionContract } from '@kobato/api/rpc/admin/revision'
import { oc } from '@orpc/contract'

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
