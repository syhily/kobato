import {
  adminTagsListInput,
  adminTagsListOutputDto,
  adminTagIdInput,
  adminTagUpsertInput,
  adminTagUpsertOutputDto,
} from '@kobato/api/contracts/admin/tags'
import { voidOutput } from '@kobato/api/contracts/primitives'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminTagsContract = {
  list: defineProcedure({ method: 'GET', path: '/admin/tags/list' })
    .input(adminTagsListInput)
    .output(adminTagsListOutputDto),
  upsert: defineProcedure({ method: 'POST', path: '/admin/tags/upsert' })
    .input(adminTagUpsertInput)
    .output(adminTagUpsertOutputDto),
  delete: defineProcedure({ method: 'POST', path: '/admin/tags/remove' }).input(adminTagIdInput).output(voidOutput),
}
