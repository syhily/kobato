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
  /**
   * Rows are live when `publishedAt <= asOf`. Defaults to the current
   * time.
   */
  asOf?: Date
  /**
   * Escape hatch for listings: skip the `publishedAt <= asOf` condition
   * so scheduled rows (`publishedAt` later than `asOf`) are included.
   */
  includeScheduled?: boolean
}

/**
 * In-memory projection of the "live" gate shared by posts and pages: a
 * row is publicly reachable when it is not soft-deleted, is published,
 * has a published revision, and its `publishedAt` is not in the future.
 *
 * `liveContentWhere` below is the SQL projection of the same gate — the
 * two MUST be changed together. SQL callers outside the content domain
 * must go through the post-/page-table bindings `livePostWhere` /
 * `livePageWhere`, never hand-bound columns. Inside the content domain
 * itself (the owner of this base — e.g. the scheduled-publish job, which
 * cannot import the entity bindings without closing an import cycle)
 * binding the struct directly is the sanctioned path.
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

/**
 * The four meta columns the live gate reads. Structural over the `post`
 * and `page` tables — both declare these columns identically.
 */
export interface LiveContentColumns {
  deletedAt: typeof postMetaTable.deletedAt | typeof pageMetaTable.deletedAt
  published: typeof postMetaTable.published | typeof pageMetaTable.published
  publishedRevisionId: typeof postMetaTable.publishedRevisionId | typeof pageMetaTable.publishedRevisionId
  publishedAt: typeof postMetaTable.publishedAt | typeof pageMetaTable.publishedAt
}

/**
 * SQL projection of the same "live" gate as `isLive` above; keep the
 * two in sync. `includeScheduled` skips only the `publishedAt <= asOf`
 * leg.
 */
export function liveContentWhere(columns: LiveContentColumns, options: LiveContentOptions = {}): SQL {
  const conditions: SQL[] = [
    isNull(columns.deletedAt),
    eq(columns.published, true),
    isNotNull(columns.publishedRevisionId),
  ]
  if (!options.includeScheduled) {
    const asOf = options.asOf ?? new Date()
    // Raw `sql` params carry no column mapping — bind epoch ms
    // (a bare Date is not bindable by node:sqlite).
    conditions.push(sql`${columns.publishedAt} <= ${asOf.getTime()}`)
  }
  return and(...conditions)!
}

export interface PromotedMeta {
  published: boolean
  publishedRevisionId: number | null
}

/**
 * In-memory projection of the "promoted" gate shared by posts and
 * pages: published with a published revision attached, ignoring
 * soft-delete state and scheduling. `promotedContentWhere` below is the
 * SQL projection — the two MUST be changed together. SQL callers must
 * go through the post-table binding `promotedPostWhere`
 * (`posts/live-gate.ts`).
 *
 * Declared as a type predicate so a promoted row's `publishedRevisionId`
 * narrows to non-null `bigint` for the caller (e.g. `restorePost`
 * fetching the published revision right after the check).
 */
export function isPromoted(meta: PromotedMeta): meta is PromotedMeta & { publishedRevisionId: number } {
  return meta.published && meta.publishedRevisionId !== null
}

/**
 * The two meta columns the promoted gate reads. Structural over the
 * `post` and `page` tables — both declare these columns identically.
 */
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
