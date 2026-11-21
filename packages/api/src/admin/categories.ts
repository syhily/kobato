import {
  adminCategoriesListInput,
  adminCategoriesListOutputDto,
  adminCategoriesReorderInput,
  adminCategoriesReorderOutputDto,
  adminCategoryIdInput,
  adminCategoryUpsertInput,
  adminCategoryUpsertOutputDto,
} from '@kobato/contracts/categories'
import { voidOutput } from '@kobato/contracts/primitives'
import { oc } from '@orpc/contract'

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
