import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/service'
import {
  deleteAdminCategory,
  listCategoriesForAdmin,
  reorderAdminCategories,
  upsertAdminCategory,
} from '@/server/domains/taxonomies/categories/service'
import { adminProc } from '@/server/http/orpc-base'
import { adminCategoryDto } from '@/shared/contracts/categories'

const list = adminProc
  .route({ method: 'GET', path: '/admin/categories/list' })
  .input(z.object({ q: z.string().optional() }))
  .output(z.object({ categories: z.array(adminCategoryDto), total: z.number() }))
  .handler(({ input }) => listCategoriesForAdmin({ q: input.q }))

const upsert = adminProc
  .route({ method: 'POST', path: '/admin/categories/upsert' })
  .input(
    z.object({
      id: z.string().min(1).optional(),
      name: z.string().trim().min(1).max(20),
      slug: z.string().optional(),
      cover: z.url().max(500),
      description: z.string().max(999).optional(),
      sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
    }),
  )
  .output(z.object({ category: adminCategoryDto }))
  .handler(async ({ input, context }) => {
    const category = await upsertAdminCategory({
      id: input.id !== undefined ? BigInt(input.id) : undefined,
      name: input.name,
      slug: input.slug,
      cover: input.cover,
      description: input.description ?? '',
      sortOrder: input.sortOrder,
    })
    recordAuditEventFromContext(context, {
      action: input.id === undefined ? 'category_created' : 'category_updated',
      resourceType: 'category',
      resourceId: String(category.id),
    })
    return { category }
  })

const remove = adminProc
  .route({ method: 'POST', path: '/admin/categories/remove' })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.void())
  .handler(async ({ input, context }) => {
    const ok = await deleteAdminCategory(BigInt(input.id))
    if (!ok) {
      throw new ORPCError('NOT_FOUND', { message: '分类不存在' })
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
    const categories = await reorderAdminCategories(input.orderedIds)
    recordAuditEventFromContext(context, {
      action: 'categories_reordered',
      resourceType: 'category',
      details: { count: input.orderedIds.length },
    })
    return { categories }
  })

export const adminCategoriesRouter = { list, upsert, delete: remove, reorder }
