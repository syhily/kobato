import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { AdminPageDetailDto, AdminPageDto } from '@/server/domains/pages/projection'
import type { AdminRevisionDto } from '@/shared/types/revision'

import { findContentById, findLatestRevision, listRevisions } from '@/server/domains/content/repos/query'
import { toAdminPageDto, toAdminRevisionDto } from '@/server/domains/pages/projection'
import { countPageMetas, findPageMetaById, listPageMetas, type ListPagesFilters } from '@/server/domains/pages/repo'
import { commentCountsByOwnerIds, metricsByOwnerIds } from '@/server/infra/db/operations/like'
import { ensureMetricsBatch } from '@/server/infra/db/operations/metric'

export interface AdminPagesListResult {
  pages: AdminPageDto[]
  total: number
  hasMore: boolean
}

export async function listPagesForAdmin(
  db: NodePgDatabase,
  filters: ListPagesFilters = {},
): Promise<AdminPagesListResult> {
  const offset = filters.offset ?? 0
  const limit = filters.limit ?? 100
  const [rows, total] = await Promise.all([
    listPageMetas(db, { ...filters, limit, offset }),
    countPageMetas(db, filters),
  ])
  if (rows.length === 0) {
    return { pages: [], total, hasMore: false }
  }
  const ownerIds = rows.map((row) => row.id)
  await ensureMetricsBatch(
    db,
    rows.map((row) => ({ type: 'page', ownerId: row.id })),
  )
  const [metrics, countRows] = await Promise.all([
    metricsByOwnerIds(db, 'page', ownerIds),
    commentCountsByOwnerIds(db, 'page', ownerIds),
  ])
  const publicIdByOwner = new Map(metrics.map((m) => [String(m.ownerId), m.publicId]))
  const countByOwner = new Map(countRows.map((r) => [String(r.ownerId), r.count]))
  return {
    pages: rows.map((row) =>
      toAdminPageDto(row, {
        commentCount: countByOwner.get(String(row.id)) ?? 0,
        commentPublicId: publicIdByOwner.get(String(row.id)) ?? '',
      }),
    ),
    total,
    hasMore: offset + rows.length < total,
  }
}

export async function getPageDetailForAdmin(db: NodePgDatabase, id: bigint): Promise<AdminPageDetailDto | null> {
  const meta = await findPageMetaById(db, id)
  if (meta === null) {
    return null
  }
  const [latest, published] = await Promise.all([
    findLatestRevision(db, 'page', meta.id),
    meta.publishedRevisionId === null ? Promise.resolve(null) : findContentById(db, meta.publishedRevisionId),
  ])
  return {
    page: toAdminPageDto(meta),
    latestRevision: latest === null ? null : toAdminRevisionDto(latest),
    publishedRevision: published === null ? null : toAdminRevisionDto(published),
  }
}

export async function listRevisionsForAdmin(db: NodePgDatabase, id: bigint): Promise<AdminRevisionDto[]> {
  const rows = await listRevisions(db, 'page', id)
  return rows.map(toAdminRevisionDto)
}
