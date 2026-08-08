import { and, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'

import type { page as pageMetaTable } from '@/server/infra/db/schema/page'
import type { post as postMetaTable } from '@/server/infra/db/schema/post'

export interface LiveMeta {
  deletedAt: Date | null
  published: boolean
  publishedRevisionId: number | null
  publishedAt: Date
}

export interface LiveContentOptions {
  /** Rows are live when `publishedAt <= asOf`; defaults to the current time. */
  asOf?: Date
  /** Escape hatch for listings: include rows with a future `publishedAt`. */
  includeScheduled?: boolean
}

/**
 * In-memory projection of the shared "live" gate; keep in sync with
 * `liveContentWhere` — external SQL callers use the table bindings.
 */
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

/** The four meta columns the live gate reads — structural over `post`/`page`. */
export interface LiveContentColumns {
  deletedAt: typeof postMetaTable.deletedAt | typeof pageMetaTable.deletedAt
  published: typeof postMetaTable.published | typeof pageMetaTable.published
  publishedRevisionId: typeof postMetaTable.publishedRevisionId | typeof pageMetaTable.publishedRevisionId
  publishedAt: typeof postMetaTable.publishedAt | typeof pageMetaTable.publishedAt
}

/**
 * SQL projection of the same "live" gate as `isLive` above; keep the
 * two in sync.
 */
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

/**
 * In-memory projection of the shared "promoted" gate; declared as a type
 * predicate so `publishedRevisionId` narrows to non-null.
 */
export function isPromoted(meta: PromotedMeta): meta is PromotedMeta & { publishedRevisionId: number } {
  return meta.published && meta.publishedRevisionId !== null
}

/** The two meta columns the promoted gate reads — structural over `post`/`page`. */
export interface PromotedContentColumns {
  published: typeof postMetaTable.published | typeof pageMetaTable.published
  publishedRevisionId: typeof postMetaTable.publishedRevisionId | typeof pageMetaTable.publishedRevisionId
}

/**
 * SQL projection of the same "promoted" gate as `isPromoted` above;
 * keep the two in sync.
 */
export function promotedContentWhere(columns: PromotedContentColumns): SQL {
  return and(eq(columns.published, true), isNotNull(columns.publishedRevisionId))!
}
