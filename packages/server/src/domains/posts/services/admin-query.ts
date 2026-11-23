import type { AdminPostDetailDto } from '@kobato/api/contracts/admin/posts'
import type { Database } from '@kobato/db/sqlite/database'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'
import type { AdminPostsListResult } from '@kobato/server/domains/posts/services/shared'

import {
  countPostMetas as countPostMetasOp,
  listPostMetas as listPostMetasOp,
  type PostListFilters,
} from '@kobato/db/sqlite/operations/content/entity-list'
import { makeEntityAdminQuery } from '@kobato/server/domains/content/entities/admin-query'
import { postDescriptor } from '@kobato/server/domains/posts/descriptor'

export type { PostListFilters }

export const listPostMetas = listPostMetasOp
export const countPostMetas = countPostMetasOp

const adminQuery = makeEntityAdminQuery(postDescriptor, {
  listMetas: listPostMetas,
  countMetas: countPostMetas,
})

export async function listPostsForAdmin(
  db: Database,
  filters: PostListFilters = {},
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
