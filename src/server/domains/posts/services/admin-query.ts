import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ListPostsFilters } from '@/server/domains/posts/repos/shared'
import type { AdminRevisionDto } from '@/shared/types/revision'

import { toAdminRevisionDto } from '@/server/domains/content/projection'
import { findContentById, findLatestRevision, listRevisions } from '@/server/domains/content/repos/query'
import { listForAdmin } from '@/server/domains/content/services/admin-list'
import { toAdminPostDto, type AdminPostDetailDto } from '@/server/domains/posts/projection'
import { countPostMetas, listPostMetas } from '@/server/domains/posts/repos/admin-query'
import { findPostMetaById } from '@/server/domains/posts/repos/single'
import {
  assertOwnPostOr404,
  type AdminPostsListResult,
  type ViewerContext,
} from '@/server/domains/posts/services/shared'
import { findCategoryNamesByIds } from '@/server/infra/db/operations/category'
import { findTagNamesByPostId, findTagNamesByPostIds } from '@/server/infra/db/operations/post-tag'
import { idFromString } from '@/shared/utils/id'

export async function listPostsForAdmin(
  db: NodePgDatabase,
  filters: ListPostsFilters = {},
  viewer?: ViewerContext,
): Promise<AdminPostsListResult> {
  let appliedFilters = filters
  if (viewer && viewer.role !== 'admin') {
    appliedFilters = { ...filters, authorId: idFromString(viewer.userId) }
  }
  const { items, total, hasMore } = await listForAdmin(db, {
    entityType: 'post',
    filters: appliedFilters,
    defaultLimit: 20,
    listRows: listPostMetas,
    countRows: countPostMetas,
    loadExtras: async (db, rows) => {
      const [tagMap, categoryMap] = await Promise.all([
        findTagNamesByPostIds(
          db,
          rows.map((row) => row.id),
        ),
        findCategoryNamesByIds(
          db,
          rows.map((row) => row.categoryId).filter((id): id is bigint => id !== null),
        ),
      ])
      return new Map(
        rows.map((row) => [
          row.id,
          {
            tags: tagMap.get(row.id) ?? [],
            categoryName: categoryMap.get(row.categoryId ?? -1n) ?? '',
          },
        ]),
      )
    },
    toDto: (row, engagement, extras) => toAdminPostDto(row, { ...engagement, ...extras }),
  })
  return { posts: items, total, hasMore }
}

export async function getPostDetailForAdmin(
  db: NodePgDatabase,
  id: bigint,
  viewer?: ViewerContext,
): Promise<AdminPostDetailDto | null> {
  const meta = await findPostMetaById(db, id)
  assertOwnPostOr404(meta, viewer)
  const [latest, published, tags, categoryMap] = await Promise.all([
    findLatestRevision(db, 'post', meta.id),
    meta.publishedRevisionId === null ? Promise.resolve(null) : findContentById(db, meta.publishedRevisionId),
    findTagNamesByPostId(db, meta.id),
    findCategoryNamesByIds(db, meta.categoryId === null ? [] : [meta.categoryId]),
  ])
  return {
    post: toAdminPostDto(meta, { tags, categoryName: categoryMap.get(meta.categoryId ?? -1n) ?? '' }),
    latestRevision: latest === null ? null : toAdminRevisionDto(latest),
    publishedRevision: published === null ? null : toAdminRevisionDto(published),
  }
}

export async function listRevisionsForAdmin(
  db: NodePgDatabase,
  id: bigint,
  viewer?: ViewerContext,
): Promise<AdminRevisionDto[]> {
  const meta = await findPostMetaById(db, id)
  assertOwnPostOr404(meta, viewer)
  const rows = await listRevisions(db, 'post', id)
  return rows.map(toAdminRevisionDto)
}
