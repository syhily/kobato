import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { deleteAdminTag, listTagsForAdmin, upsertAdminTag } from '@/server/domains/taxonomies/tags/service'
import { adminProc, authorProc, localizedOrpcError } from '@/server/http/orpc-base'
import { adminTagDto } from '@/shared/contracts/tags'
import { idFromString } from '@/shared/utils/id'

const list = authorProc
  .route({ method: 'GET', path: '/admin/tags/list' })
  .input(
    z.object({
      q: z.string().optional(),
      offset: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
    }),
  )
  .output(z.object({ tags: z.array(adminTagDto), total: z.number(), hasMore: z.boolean() }))
  .handler(({ input, context }) =>
    listTagsForAdmin(context.db, { q: input.q, offset: input.offset, limit: input.limit }),
  )

const upsert = authorProc
  .route({ method: 'POST', path: '/admin/tags/upsert' })
  .input(
    z.object({
      id: z.string().min(1).optional(),
      name: z.string().trim().min(1).max(20),
      slug: z.string().optional(),
      ogImage: z.string().optional(),
    }),
  )
  .output(z.object({ tag: adminTagDto }))
  .handler(async ({ input, context }) => {
    const tag = await upsertAdminTag(
      context.db,
      {
        id: input.id !== undefined ? idFromString(input.id) : undefined,
        name: input.name,
        slug: input.slug,
        ogImage: input.ogImage,
      },
      context.viewer,
    )
    recordAuditEventFromContext(context, {
      action: input.id === undefined ? 'tag_created' : 'tag_updated',
      resourceType: 'tag',
      resourceId: tag.id,
    })
    return { tag }
  })

// Deleting shared tags is admin-only (like renaming): the in-use CONFLICT
// enumerates the posts carrying the tag, which would leak other authors'
// post titles to any author probing tag ids.
const remove = adminProc
  .route({ method: 'POST', path: '/admin/tags/remove' })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.void())
  .handler(async ({ input, context }) => {
    const ok = await deleteAdminTag(context.db, idFromString(input.id), context.viewer)
    if (!ok) {
      throw localizedOrpcError(context, 'NOT_FOUND', 'taxonomy.error.notFound', { entity: 'tag' })
    }
    recordAuditEventFromContext(context, {
      action: 'tag_deleted',
      resourceType: 'tag',
      resourceId: input.id,
    })
  })

export const adminTagsRouter = { list, upsert, delete: remove }
