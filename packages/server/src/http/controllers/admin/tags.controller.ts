import { adminTagsContract } from '@kobato/api/rpc/admin/tags'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { deleteAdminTag, listTagsForAdmin, upsertAdminTag } from '@kobato/server/domains/taxonomies/tags/service'
import { implementAdmin, implementAuthor, localizedOrpcError } from '@kobato/server/http/orpc-base'
import { idFromString } from '@kobato/utils/id'

const authorImpl = implementAuthor(adminTagsContract)
const adminImpl = implementAdmin(adminTagsContract)

const list = authorImpl.list.handler(({ input, context }) =>
  listTagsForAdmin(context.db, { q: input.q, offset: input.offset, limit: input.limit }),
)

const upsert = authorImpl.upsert.handler(async ({ input, context }) => {
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

const remove = adminImpl.delete.handler(async ({ input, context }) => {
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

export const adminTagsRouter = authorImpl.router({ list, upsert, delete: remove })
