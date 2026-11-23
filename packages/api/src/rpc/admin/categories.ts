import {
  adminCategoriesListInput,
  adminCategoriesListOutputDto,
  adminCategoriesReorderInput,
  adminCategoriesReorderOutputDto,
  adminCategoryIdInput,
  adminCategoryUpsertInput,
  adminCategoryUpsertOutputDto,
} from '@kobato/api/contracts/admin/categories'
import { voidOutput } from '@kobato/api/contracts/primitives'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminCategoriesContract = {
  list: defineProcedure({ method: 'GET', path: '/admin/categories/list' })
    .input(adminCategoriesListInput)
    .output(adminCategoriesListOutputDto),
  upsert: defineProcedure({ method: 'POST', path: '/admin/categories/upsert' })
    .input(adminCategoryUpsertInput)
    .output(adminCategoryUpsertOutputDto),
  delete: defineProcedure({ method: 'POST', path: '/admin/categories/remove' })
    .input(adminCategoryIdInput)
    .output(voidOutput),
  reorder: defineProcedure({ method: 'POST', path: '/admin/categories/reorder' })
    .input(adminCategoriesReorderInput)
    .output(adminCategoriesReorderOutputDto),
}
