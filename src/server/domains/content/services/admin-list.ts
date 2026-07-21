import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { EntityType } from '@/server/infra/db/target'

import { commentCountsByOwnerIds, metricsByOwnerIds } from '@/server/infra/db/operations/like'
import { ensureMetricsBatch } from '@/server/infra/db/operations/metric'

/** Engagement fields every admin list row gets from the metrics/comment batch. */
export interface AdminListEngagement {
  commentCount: number
  commentPublicId: string
}

export interface AdminListResult<Dto> {
  items: Dto[]
  total: number
  hasMore: boolean
}

export interface ListForAdminOptions<
  Filters extends { limit?: number; offset?: number },
  Row extends { id: bigint },
  Extras extends object,
  Dto,
> {
  /** Discriminator for the metrics/comment fan-out. */
  entityType: EntityType
  filters: Filters
  /** Applied when `filters.limit` is undefined. */
  defaultLimit: number
  listRows: (db: NodePgDatabase, filters: Filters & { limit: number; offset: number }) => Promise<Row[]>
  countRows: (db: NodePgDatabase, filters: Filters) => Promise<number>
  /**
   * Domain-specific enrichment loaded in the same batch as the
   * metrics/comment reads (posts use it for tags + category names).
   * Keyed by row id; rows missing from the map get `undefined` extras.
   */
  loadExtras?: (db: NodePgDatabase, rows: Row[]) => Promise<Map<bigint, Extras>>
  toDto: (row: Row, engagement: AdminListEngagement, extras: Extras | undefined) => Dto
}

/**
 * Shared orchestration for the posts/pages admin lists: page + count in
 * parallel, backfill metric rows, then read engagement counters (and any
 * domain extras) in one batch and project each row through `toDto`. The
 * domains keep their own repos (join/where/order) and DTO mappers; only
 * the fan-out shape lives here.
 */
export async function listForAdmin<
  Filters extends { limit?: number; offset?: number },
  Row extends { id: bigint },
  Extras extends object = Record<string, never>,
  Dto = unknown,
>(db: NodePgDatabase, options: ListForAdminOptions<Filters, Row, Extras, Dto>): Promise<AdminListResult<Dto>> {
  const offset = options.filters.offset ?? 0
  const limit = options.filters.limit ?? options.defaultLimit
  const [rows, total] = await Promise.all([
    options.listRows(db, { ...options.filters, limit, offset }),
    options.countRows(db, options.filters),
  ])
  if (rows.length === 0) {
    return { items: [], total, hasMore: false }
  }
  const ownerIds = rows.map((row) => row.id)
  await ensureMetricsBatch(
    db,
    rows.map((row) => ({ type: options.entityType, ownerId: row.id })),
  )
  const [metrics, countRows, extras] = await Promise.all([
    metricsByOwnerIds(db, options.entityType, ownerIds),
    commentCountsByOwnerIds(db, options.entityType, ownerIds),
    options.loadExtras?.(db, rows) ?? Promise.resolve(new Map<bigint, Extras>()),
  ])
  const publicIdByOwner = new Map(metrics.map((m) => [String(m.ownerId), m.publicId]))
  const countByOwner = new Map(countRows.map((r) => [String(r.ownerId), r.count]))
  return {
    items: rows.map((row) =>
      options.toDto(
        row,
        {
          commentCount: countByOwner.get(String(row.id)) ?? 0,
          commentPublicId: publicIdByOwner.get(String(row.id)) ?? '',
        },
        extras.get(row.id),
      ),
    ),
    total,
    hasMore: offset + rows.length < total,
  }
}
