import type { Database } from '@kobato/server/infra/db/database'
import type { EntityTarget, EntityType } from '@kobato/server/infra/db/target'

import { comment } from '@kobato/server/infra/db/schema/comment'
import { like, metric } from '@kobato/server/infra/db/schema/metric'
import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'

// Filter clause used everywhere we look up like rows by entity target.
function whereLikeTarget(target: EntityTarget) {
  return and(eq(like.type, target.type), eq(like.ownerId, target.ownerId))
}

/**
 * Atomic "register like + bump counter + read fresh count" in one transaction.
 *
 * Previously the like flow ran three separate round-trips which let a
 * concurrent decrement land between the bump and the read and report a
 * stale count to the client. The transaction guarantees the returned
 * count reflects this exact insert; downstream UPDATEs touching the
 * same row queue behind it.
 */
export async function recordLikeAndCount(db: Database, token: string, target: EntityTarget): Promise<number> {
  return db.transaction((tx) => {
    const now = new Date()
    tx.insert(like)
      .values({
        token,
        type: target.type,
        ownerId: target.ownerId,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    const rows = tx
      .update(metric)
      .set({ voteUp: sql`${metric.voteUp} + 1` })
      .where(and(eq(metric.type, target.type), eq(metric.ownerId, target.ownerId)))
      .returning({ voteUp: metric.voteUp })
      .all()
    return rows[0]?.voteUp ?? 0
  })
}

// Sync (node:sqlite): called inside the unlike transaction.
export function consumeActiveLikeToken(db: Database, target: EntityTarget, token: string): boolean {
  const now = new Date()
  const rows = db
    .update(like)
    .set({ updatedAt: now, deletedAt: now })
    .where(and(eq(like.token, token), whereLikeTarget(target), isNull(like.deletedAt)))
    .returning({ id: like.id })
    .all()
  return rows.length > 0
}

export async function metricVoteUp(db: Database, target: EntityTarget): Promise<number> {
  const rows = await db
    .select({ like: metric.voteUp })
    .from(metric)
    .where(and(eq(metric.type, target.type), eq(metric.ownerId, target.ownerId)))
    .limit(1)
  return rows[0]?.like ?? 0
}

export interface MetricsRow {
  type: EntityType
  ownerId: number
  publicId: string
  like: number | null
  view: number | null
}

/**
 * Batch metric read scoped to a single entity type. Callers fan out
 * per-type and merge the results — in practice every admin list / feed
 * surface is already homogeneous, and a single `eq + inArray` is
 * cheaper than a polymorphic `(type, owner_id) IN (...)` predicate.
 */
export async function metricsByOwnerIds(db: Database, type: EntityType, ownerIds: number[]): Promise<MetricsRow[]> {
  if (ownerIds.length === 0) {
    return []
  }
  const rows = await db
    .select({
      type: metric.type,
      ownerId: metric.ownerId,
      publicId: metric.publicId,
      like: metric.voteUp,
      view: metric.pv,
    })
    .from(metric)
    .where(and(eq(metric.type, type), inArray(metric.ownerId, ownerIds)))
  return rows.map((r) => ({
    type: r.type as EntityType,
    ownerId: r.ownerId as number,
    publicId: r.publicId,
    like: r.like,
    view: r.view,
  }))
}

export interface TargetCommentCountRow {
  ownerId: number
  count: number
}

/**
 * Batch comment count read scoped to a single entity type. Mirrors
 * `metricsByOwnerIds`'s shape so admin list services can fan both out
 * in the same loop.
 */
export async function commentCountsByOwnerIds(
  db: Database,
  type: EntityType,
  ownerIds: number[],
): Promise<TargetCommentCountRow[]> {
  if (ownerIds.length === 0) {
    return []
  }
  const rows = await db
    .select({ ownerId: comment.ownerId, count: sql<number>`COUNT(*)` })
    .from(comment)
    .where(
      and(
        eq(comment.type, type),
        inArray(comment.ownerId, ownerIds),
        eq(comment.isPending, false),
        isNull(comment.deletedAt),
      ),
    )
    .groupBy(comment.ownerId)
  return rows
    .filter((r): r is { ownerId: number; count: number } => r.ownerId !== null)
    .map((r) => ({ ownerId: r.ownerId, count: Number(r.count) }))
}

export async function purgeOldLikeTokens(db: Database, before: Date): Promise<void> {
  await db.delete(like).where(and(isNotNull(like.deletedAt), lt(like.deletedAt, before)))
}

export async function existsActiveLikeToken(db: Database, target: EntityTarget, token: string): Promise<boolean> {
  const rows = await db
    .select({ id: like.id })
    .from(like)
    .where(and(eq(like.token, token), whereLikeTarget(target), isNull(like.deletedAt)))
    .limit(1)
  return rows.length > 0
}
