import { and, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'

import type { page as pageMetaTable } from '@/server/infra/db/schema/page'
import type { post as postMetaTable } from '@/server/infra/db/schema/post'

export interface LiveMeta {
  deletedAt: Date | null
  published: boolean
  publishedRevisionId: bigint | null
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
   * so scheduled (future-dated) rows are included.
   */
  includeScheduled?: boolean
}

/**
 * In-memory projection of the "live" gate shared by posts and pages. A
 * row is live — reachable at its public URL and listed publicly — when
 * it is not soft-deleted, is published, has a published revision
 * attached, and its `publishedAt` is not in the future.
 *
 * This is one of two projections of a single gate defined in this
 * module; the SQL projection is `liveContentWhere` below. The two MUST
 * be changed together — a condition edited in only one of them silently
 * splits what "live" means between read paths. Both take the same
 * `LiveContentOptions` bag; `includeScheduled` skips only the
 * `publishedAt` leg in each.
 *
 * SQL callers must not bind the meta columns by hand: the post-/page-
 * table bindings `livePostWhere` (`posts/live-gate.ts`) and
 * `livePageWhere` (`pages/live-gate.ts`) are the only sanctioned callers of
 * `liveContentWhere` outside this module and its tests.
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
 * SQL projection of the same "live" gate as `isLive` above — not
 * soft-deleted, published, has a published revision, and (unless
 * `includeScheduled`) `publishedAt <= asOf`. Takes the same
 * `LiveContentOptions` bag as `isLive`; keep the two projections in
 * sync (see the warning on `isLive`). Call this through the post-/page-
 * table bindings `livePostWhere` / `livePageWhere`, never with hand-bound
 * columns.
 */
export function liveContentWhere(columns: LiveContentColumns, options: LiveContentOptions = {}): SQL {
  const conditions: SQL[] = [
    isNull(columns.deletedAt),
    eq(columns.published, true),
    isNotNull(columns.publishedRevisionId),
  ]
  if (!options.includeScheduled) {
    const asOf = options.asOf ?? new Date()
    conditions.push(sql`${columns.publishedAt} <= ${asOf}`)
  }
  return and(...conditions)!
}

export interface PromotedMeta {
  published: boolean
  publishedRevisionId: bigint | null
}

/**
 * In-memory projection of the "promoted" gate shared by posts and
 * pages. A row is promoted when it is marked published and has a
 * published revision attached — nothing more. These are the live gate's
 * middle legs minus `deletedAt` and `publishedAt`: promoted ignores
 * soft-delete state and scheduling, answering "does this row have a
 * published revision to show", which is what lifecycle bucketing
 * (`buildPostsWhere`) and restore re-indexing (`restorePost`) need.
 *
 * This is one of two projections of a single gate defined in this
 * module; the SQL projection is `promotedContentWhere` below. The two
 * MUST be changed together — a condition edited in only one of them
 * silently splits what "promoted" means between read paths.
 *
 * SQL callers must not bind the meta columns by hand: the post-table
 * binding `promotedPostWhere` (`posts/live-gate.ts`) is the only
 * sanctioned caller of `promotedContentWhere` outside this module and
 * its tests.
 *
 * Declared as a type predicate so a promoted row's `publishedRevisionId`
 * narrows to non-null `bigint` for the caller (e.g. `restorePost`
 * fetching the published revision right after the check).
 */
export function isPromoted(meta: PromotedMeta): meta is PromotedMeta & { publishedRevisionId: bigint } {
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
 * SQL projection of the same "promoted" gate as `isPromoted` above —
 * published with a published revision attached, regardless of
 * soft-delete state and scheduling. Keep the two projections in sync
 * (see the warning on `isPromoted`). Call this through the post-table
 * binding `promotedPostWhere`, never with hand-bound columns.
 */
export function promotedContentWhere(columns: PromotedContentColumns): SQL {
  return and(eq(columns.published, true), isNotNull(columns.publishedRevisionId))!
}
