import type { AdminPostDetailDto } from '@kobato/contracts/posts.ts'
import type { Database } from '@kobato/db/database.ts'
import type { PostMetaRow } from '@kobato/db/types.ts'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac.ts'
import type { ListPostsFilters } from '@kobato/server/domains/posts/repos/shared.ts'
import type { AdminPostsListResult } from '@kobato/server/domains/posts/services/shared.ts'

import { post as postMetaTable } from '@kobato/db/schema/post.ts'
import { makeEntityAdminQuery } from '@kobato/server/domains/content/entities/admin-query.ts'
import { makeMetaListQueries } from '@kobato/server/domains/content/entities/meta-repo.ts'
import { postDescriptor } from '@kobato/server/domains/posts/descriptor.ts'
import { buildPostsOrderBy, buildPostsWhere } from '@kobato/server/domains/posts/repos/shared.ts'

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
