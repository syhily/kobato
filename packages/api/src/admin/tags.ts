import { voidOutput } from '@kobato/contracts/primitives.ts'
import {
  adminTagsListInput,
  adminTagsListOutputDto,
  adminTagIdInput,
  adminTagUpsertInput,
  adminTagUpsertOutputDto,
} from '@kobato/contracts/tags.ts'
import { oc } from '@orpc/contract'

export const adminTagsContract = {
  list: oc.route({ method: 'GET', path: '/admin/tags/list' }).input(adminTagsListInput).output(adminTagsListOutputDto),
  upsert: oc
    .route({ method: 'POST', path: '/admin/tags/upsert' })
    .input(adminTagUpsertInput)
    .output(adminTagUpsertOutputDto),
  delete: oc.route({ method: 'POST', path: '/admin/tags/remove' }).input(adminTagIdInput).output(voidOutput),
}
