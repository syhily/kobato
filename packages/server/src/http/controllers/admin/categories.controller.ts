import { adminCategoryDto } from '@kobato/contracts/categories.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import {
  deleteAdminCategory,
  reorderAdminCategories,
  upsertAdminCategory,
} from '@kobato/server/domains/taxonomies/categories/services/mutate.ts'
import { listCategoriesForAdmin } from '@kobato/server/domains/taxonomies/categories/services/query.ts'
import { adminProc, localizedOrpcError } from '@kobato/server/http/orpc-base.ts'
import { idFromString } from '@kobato/utils/id.ts'
import { z } from 'zod'

const list = adminProc
  .route({ method: 'GET', path: '/admin/categories/list' })
  .input(z.object({ q: z.string().optional() }))
  .output(z.object({ categories: z.array(adminCategoryDto), total: z.number() }))
  .handler(({ input, context }) => listCategoriesForAdmin(context.db, { q: input.q }))

const upsert = adminProc
  .route({ method: 'POST', path: '/admin/categories/upsert' })
  .input(
    z.object({
      id: z.string().min(1).optional(),
      name: z.string().trim().min(1).max(20),
      slug: z.string().optional(),
      cover: z.url().max(500),
      og: z.url().max(500).optional(),
      description: z.string().max(999).optional(),
    }),
  )
  .output(z.object({ category: adminCategoryDto }))
  .handler(async ({ input, context }) => {
    const category = await upsertAdminCategory(context.db, {
      id: input.id !== undefined ? idFromString(input.id) : undefined,
      name: input.name,
      slug: input.slug,
      cover: input.cover,
      og: input.og,
      description: input.description ?? '',
    })
    recordAuditEventFromContext(context, {
      action: input.id === undefined ? 'category_created' : 'category_updated',
      resourceType: 'category',
      resourceId: category.id,
    })
    return { category }
  })

const remove = adminProc
  .route({ method: 'POST', path: '/admin/categories/remove' })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.void())
  .handler(async ({ input, context }) => {
    const ok = await deleteAdminCategory(context.db, idFromString(input.id))
    if (!ok) {
      throw localizedOrpcError(context, 'NOT_FOUND', 'taxonomy.error.notFound', { entity: 'category' })
    }
    recordAuditEventFromContext(context, {
      action: 'category_deleted',
      resourceType: 'category',
      resourceId: input.id,
    })
  })

const reorder = adminProc
  .route({ method: 'POST', path: '/admin/categories/reorder' })
  .input(z.object({ orderedIds: z.array(z.string().min(1)).min(1).max(500) }))
  .output(z.object({ categories: z.array(adminCategoryDto) }))
  .handler(async ({ input, context }) => {
    const categories = await reorderAdminCategories(context.db, input.orderedIds)
    recordAuditEventFromContext(context, {
      action: 'categories_reordered',
      resourceType: 'category',
      details: { count: input.orderedIds.length },
    })
    return { categories }
  })

export const adminCategoriesRouter = { list, upsert, delete: remove, reorder }
