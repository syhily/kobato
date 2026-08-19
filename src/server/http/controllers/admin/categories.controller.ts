import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import {
  deleteAdminCategory,
  reorderAdminCategories,
  upsertAdminCategory,
} from '@/server/domains/taxonomies/categories/services/mutate'
import { listCategoriesForAdmin } from '@/server/domains/taxonomies/categories/services/query'
import { adminProc } from '@/server/http/orpc-base'
import { adminCategoryDto } from '@/shared/contracts/categories'
import { idFromString } from '@/shared/utils/id'

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
    const categories = await reorderAdminCategories(context.db, input.orderedIds)
    recordAuditEventFromContext(context, {
      action: 'categories_reordered',
      resourceType: 'category',
      details: { count: input.orderedIds.length },
    })
    return { categories }
  })

export const adminCategoriesRouter = { list, upsert, delete: remove, reorder }
