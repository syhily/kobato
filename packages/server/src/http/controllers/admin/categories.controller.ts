import { adminCategoriesContract } from '@kobato/api/admin/categories.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import {
  deleteAdminCategory,
  reorderAdminCategories,
  upsertAdminCategory,
} from '@kobato/server/domains/taxonomies/categories/services/mutate.ts'
import { listCategoriesForAdmin } from '@kobato/server/domains/taxonomies/categories/services/query.ts'
import { implementAdmin, localizedOrpcError } from '@kobato/server/http/orpc-base.ts'
import { idFromString } from '@kobato/utils/id.ts'

// Contract-first: method/path/input/output live in
// `@kobato/api/admin/categories.ts`; this controller only implements the
// procedures (admin base).
const impl = implementAdmin(adminCategoriesContract)

const list = impl.list.handler(({ input, context }) => listCategoriesForAdmin(context.db, { q: input.q }))

const upsert = impl.upsert.handler(async ({ input, context }) => {
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

const remove = impl.delete.handler(async ({ input, context }) => {
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

const reorder = impl.reorder.handler(async ({ input, context }) => {
  const categories = await reorderAdminCategories(context.db, input.orderedIds)
  recordAuditEventFromContext(context, {
    action: 'categories_reordered',
    resourceType: 'category',
    details: { count: input.orderedIds.length },
  })
  return { categories }
})

export const adminCategoriesRouter = impl.router({ list, upsert, delete: remove, reorder })
