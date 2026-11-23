import { contentRestoreResultDto } from '@kobato/api/contracts/admin/content-admin-base'
import {
  adminPageDetailDto,
  adminPageIdInput,
  adminPageUnpublishOutputDto,
  adminPageUpsertMetaOutputDto,
  listPageRevisionsOutputDto,
  listPagesOutputDto,
  listPagesSchema,
  upsertPageMetaSchema,
} from '@kobato/api/contracts/admin/pages'
import { voidOutput } from '@kobato/api/contracts/primitives'
import { revisionContract } from '@kobato/api/rpc/admin/revision'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminPagesContract = {
  list: defineProcedure({ method: 'GET', path: '/admin/pages/list' }).input(listPagesSchema).output(listPagesOutputDto),
  get: defineProcedure({ method: 'GET', path: '/admin/pages/get' }).input(adminPageIdInput).output(adminPageDetailDto),
  delete: defineProcedure({ method: 'POST', path: '/admin/pages/remove' }).input(adminPageIdInput).output(voidOutput),
  restore: defineProcedure({ method: 'POST', path: '/admin/pages/restore' })
    .input(adminPageIdInput)
    .output(contentRestoreResultDto),
  unpublish: defineProcedure({ method: 'POST', path: '/admin/pages/unpublish' })
    .input(adminPageIdInput)
    .output(adminPageUnpublishOutputDto),
  ...revisionContract('/admin/pages'),
  upsertMeta: defineProcedure({ method: 'POST', path: '/admin/pages/upsert-meta' })
    .input(upsertPageMetaSchema)
    .output(adminPageUpsertMetaOutputDto),
  listRevisions: defineProcedure({ method: 'GET', path: '/admin/pages/list-revisions' })
    .input(adminPageIdInput)
    .output(listPageRevisionsOutputDto),
}
