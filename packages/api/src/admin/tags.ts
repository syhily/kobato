import { voidOutput } from '@kobato/contracts/primitives.ts'
import {
  adminTagsListInput,
  adminTagsListOutputDto,
  adminTagIdInput,
  adminTagUpsertInput,
  adminTagUpsertOutputDto,
} from '@kobato/contracts/tags.ts'
import { oc } from '@orpc/contract'

// Admin tags RPC contract — `list`/`upsert` run on the author base, `delete`
// on the admin base (deleting shared tags is admin-only); the controller maps
// each procedure to its original guard.
export const adminTagsContract = {
  list: oc.route({ method: 'GET', path: '/admin/tags/list' }).input(adminTagsListInput).output(adminTagsListOutputDto),
  upsert: oc
    .route({ method: 'POST', path: '/admin/tags/upsert' })
    .input(adminTagUpsertInput)
    .output(adminTagUpsertOutputDto),
  delete: oc.route({ method: 'POST', path: '/admin/tags/remove' }).input(adminTagIdInput).output(voidOutput),
}
