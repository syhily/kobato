import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ListPostsFilters } from '@/server/domains/posts/repos/shared'

import { findContentById, findLatestRevision, listRevisions } from '@/server/domains/content/repo'
import {
  toAdminPostDto,
  toAdminRevisionDto,
  type AdminPostDetailDto,
  type AdminRevisionDto,
} from '@/server/domains/posts/projection'
import { countPostMetas, listPostMetas } from '@/server/domains/posts/repos/admin-query'
import { findPostMetaById } from '@/server/domains/posts/repos/single'
import {
  assertOwnPostOr404,
  type AdminPostsListResult,
  type ViewerContext,
} from '@/server/domains/posts/services/shared'
import { commentCountsByOwnerIds, metricsByOwnerIds } from '@/server/infra/db/operations/like'
import { ensureMetricsBatch } from '@/server/infra/db/operations/metric'
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
  const offset = appliedFilters.offset ?? 0
  const limit = appliedFilters.limit ?? 20
  const [rows, total] = await Promise.all([
    listPostMetas(db, { ...appliedFilters, limit, offset }),
    countPostMetas(db, appliedFilters),
  ])
  if (rows.length === 0) {
    return { posts: [], total, hasMore: false }
  }
  const ownerIds = rows.map((row) => row.id)
  await ensureMetricsBatch(
    db,
    rows.map((row) => ({ type: 'post', ownerId: row.id })),
  )
  const [metrics, countRows] = await Promise.all([
    metricsByOwnerIds(db, 'post', ownerIds),
    commentCountsByOwnerIds(db, 'post', ownerIds),
  ])
  const publicIdByOwner = new Map(metrics.map((m) => [String(m.ownerId), m.publicId]))
  const countByOwner = new Map(countRows.map((r) => [String(r.ownerId), r.count]))
  return {
    posts: rows.map((row) =>
      toAdminPostDto(row, {
        commentCount: countByOwner.get(String(row.id)) ?? 0,
        commentPublicId: publicIdByOwner.get(String(row.id)) ?? '',
      }),
    ),
    total,
    hasMore: offset + rows.length < total,
  }
}

export async function getPostDetailForAdmin(
  db: NodePgDatabase,
  id: bigint,
  viewer?: ViewerContext,
): Promise<AdminPostDetailDto | null> {
  const meta = await findPostMetaById(db, id)
  assertOwnPostOr404(meta, viewer)
  const [latest, published] = await Promise.all([
    findLatestRevision(db, 'post', meta.id),
    meta.publishedRevisionId === null ? Promise.resolve(null) : findContentById(db, meta.publishedRevisionId),
  ])
  return {
    post: toAdminPostDto(meta),
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
