import type { AdminPageDetailDto, AdminPageDto, AdminRevisionDto } from '@/server/domains/pages/projection'

import { toAdminPageDto, toAdminRevisionDto } from '@/server/domains/pages/projection'
import {
  countPageMetas,
  findContentById,
  findLatestRevision,
  findPageMetaById,
  listPageMetas,
  listRevisions,
  type ListPagesFilters,
} from '@/server/domains/pages/repo'
import { commentCountsByOwnerIds, metricsByOwnerIds } from '@/server/infra/db/operations/like'
import { ensureMetric } from '@/server/infra/db/operations/metric'

export interface AdminPagesListResult {
  pages: AdminPageDto[]
  total: number
  hasMore: boolean
}

export async function listPagesForAdmin(filters: ListPagesFilters = {}): Promise<AdminPagesListResult> {
  const offset = filters.offset ?? 0
  const limit = filters.limit ?? 100
  const [rows, total] = await Promise.all([listPageMetas({ ...filters, limit, offset }), countPageMetas(filters)])
  if (rows.length === 0) {
    return { pages: [], total, hasMore: false }
  }
  // Ensure every listed page has a `metric` row so the admin
  // comment-count link can compose `?pageKey=<publicId>` even before
  // the page has been visited publicly. The upsert is idempotent and
  // batched in a single Promise.all.
  const ownerIds = rows.map((row) => row.id)
  await Promise.all(rows.map((row) => ensureMetric({ type: 'page', ownerId: row.id })))
  const [metrics, countRows] = await Promise.all([
    metricsByOwnerIds('page', ownerIds),
    commentCountsByOwnerIds('page', ownerIds),
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

export async function getPageDetailForAdmin(id: bigint): Promise<AdminPageDetailDto | null> {
  const meta = await findPageMetaById(id)
  if (meta === null) {
    return null
  }
  const [latest, published] = await Promise.all([
    findLatestRevision('page', meta.id),
    meta.publishedRevisionId === null ? Promise.resolve(null) : findContentById(meta.publishedRevisionId),
  ])
  return {
    page: toAdminPageDto(meta),
    latestRevision: latest === null ? null : toAdminRevisionDto(latest),
    publishedRevision: published === null ? null : toAdminRevisionDto(published),
  }
}

export async function listRevisionsForAdmin(id: bigint): Promise<AdminRevisionDto[]> {
  const rows = await listRevisions('page', id)
  return rows.map(toAdminRevisionDto)
}
