import type { page as pageMetaTable } from '@kobato/db/schema/page.ts'
import type { post as postMetaTable } from '@kobato/db/schema/post.ts'

import { and, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'

export interface LiveMeta {
  deletedAt: Date | null
  published: boolean
  publishedRevisionId: number | null
  publishedAt: Date
}

export interface LiveContentOptions {
  asOf?: Date
  includeScheduled?: boolean
}

/** In-memory projection of the shared "live" gate; must stay in sync with `liveContentWhere`. */
export function isLive(meta: LiveMeta, options: LiveContentOptions = {}): boolean {
  if (meta.deletedAt !== null) {
    return false
  }
  if (!meta.published) {
    return false
  }
  if (meta.publishedRevisionId === null) {
    return false
  }
  if (!options.includeScheduled) {
    const asOf = options.asOf ?? new Date()
    if (meta.publishedAt.getTime() > asOf.getTime()) {
      return false
    }
  }
  return true
}

export interface LiveContentColumns {
  deletedAt: typeof postMetaTable.deletedAt | typeof pageMetaTable.deletedAt
  published: typeof postMetaTable.published | typeof pageMetaTable.published
  publishedRevisionId: typeof postMetaTable.publishedRevisionId | typeof pageMetaTable.publishedRevisionId
  publishedAt: typeof postMetaTable.publishedAt | typeof pageMetaTable.publishedAt
}

/** SQL projection of the same "live" gate as `isLive`; keep the two in sync. */
export function liveContentWhere(columns: LiveContentColumns, options: LiveContentOptions = {}): SQL {
  const conditions: SQL[] = [
    isNull(columns.deletedAt),
    eq(columns.published, true),
    isNotNull(columns.publishedRevisionId),
  ]
  if (!options.includeScheduled) {
    const asOf = options.asOf ?? new Date()
    // Bare `Date` is not bindable by node:sqlite — bind epoch ms.
    conditions.push(sql`${columns.publishedAt} <= ${asOf.getTime()}`)
  }
  return and(...conditions)!
}

export interface PromotedMeta {
  published: boolean
  publishedRevisionId: number | null
}

export function isPromoted(meta: PromotedMeta): meta is PromotedMeta & { publishedRevisionId: number } {
  return meta.published && meta.publishedRevisionId !== null
}

export interface PromotedContentColumns {
  published: typeof postMetaTable.published | typeof pageMetaTable.published
  publishedRevisionId: typeof postMetaTable.publishedRevisionId | typeof pageMetaTable.publishedRevisionId
}

/** SQL projection of the same "promoted" gate as `isPromoted`; keep the two in sync. */
export function promotedContentWhere(columns: PromotedContentColumns): SQL {
  return and(eq(columns.published, true), isNotNull(columns.publishedRevisionId))!
}
