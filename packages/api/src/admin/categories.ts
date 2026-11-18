import {
  adminCategoriesListInput,
  adminCategoriesListOutputDto,
  adminCategoriesReorderInput,
  adminCategoriesReorderOutputDto,
  adminCategoryIdInput,
  adminCategoryUpsertInput,
  adminCategoryUpsertOutputDto,
} from '@kobato/contracts/categories.ts'
import { voidOutput } from '@kobato/contracts/primitives.ts'
import { oc } from '@orpc/contract'

// Admin categories RPC contract — admin base on the server.
export const adminCategoriesContract = {
  list: oc
    .route({ method: 'GET', path: '/admin/categories/list' })
    .input(adminCategoriesListInput)
    .output(adminCategoriesListOutputDto),
  upsert: oc
    .route({ method: 'POST', path: '/admin/categories/upsert' })
    .input(adminCategoryUpsertInput)
    .output(adminCategoryUpsertOutputDto),
  delete: oc.route({ method: 'POST', path: '/admin/categories/remove' }).input(adminCategoryIdInput).output(voidOutput),
  reorder: oc
    .route({ method: 'POST', path: '/admin/categories/reorder' })
    .input(adminCategoriesReorderInput)
    .output(adminCategoriesReorderOutputDto),
}
