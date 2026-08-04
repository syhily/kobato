import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'
import type { AdminPostDetailDto } from '@kobato/server/domains/posts/projection'
import type { ListPostsFilters } from '@kobato/server/domains/posts/repos/shared'
import type { AdminPostsListResult } from '@kobato/server/domains/posts/services/shared'
import type { Database } from '@kobato/server/infra/db/database'
import type { PostMetaRow } from '@kobato/server/infra/db/types'

import { makeEntityAdminQuery } from '@kobato/server/domains/content/entities/admin-query'
import { makeMetaListQueries } from '@kobato/server/domains/content/entities/meta-repo'
import { postDescriptor } from '@kobato/server/domains/posts/descriptor'
import { buildPostsOrderBy, buildPostsWhere } from '@kobato/server/domains/posts/repos/shared'
import { post as postMetaTable } from '@kobato/server/infra/db/schema/post'

// Meta list/count come from the shared list-query factory
// (`content/entities/meta-repo.ts`) with the post where/orderBy legs.
const listQueries = makeMetaListQueries<PostMetaRow, ListPostsFilters>(postMetaTable, {
  buildWhere: buildPostsWhere,
  orderBy: buildPostsOrderBy,
})

export const listPostMetas = listQueries.listMetas
export const countPostMetas = listQueries.countMetas

const adminQuery = makeEntityAdminQuery(postDescriptor, listQueries)

export async function listPostsForAdmin(
  db: Database,
  filters: ListPostsFilters = {},
  viewer?: ViewerIdentity,
): Promise<AdminPostsListResult> {
  const { items, total, hasMore } = await adminQuery.listForAdmin(db, filters, viewer)
  return { posts: items, total, hasMore }
}

export async function getPostDetailForAdmin(
  db: Database,
  id: number,
  viewer?: ViewerIdentity,
): Promise<AdminPostDetailDto> {
  const { meta, latestRevision, publishedRevision } = await adminQuery.getDetailForAdmin(db, id, viewer)
  return { post: meta, latestRevision, publishedRevision }
}

export const listRevisionsForAdmin = adminQuery.listRevisionsForAdmin
