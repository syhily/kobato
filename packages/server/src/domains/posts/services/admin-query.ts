import type { AdminPostDetailDto } from '@kobato/shared/contracts/posts.ts'

import type { Database } from '../../../infra/db/database'
import type { PostMetaRow } from '../../../infra/db/types'
import type { ViewerIdentity } from '../../auth/rbac'
import type { ListPostsFilters } from '../repos/shared'
import type { AdminPostsListResult } from './shared'

import { post as postMetaTable } from '../../../infra/db/schema/post'
import { makeEntityAdminQuery } from '../../content/entities/admin-query'
import { makeMetaListQueries } from '../../content/entities/meta-repo'
import { postDescriptor } from '../descriptor'
import { buildPostsOrderBy, buildPostsWhere } from '../repos/shared'

// List/count come from the shared list-query factory with the post where/orderBy legs.
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
