import type { Database } from '@kobato/db/sqlite/database'
import type { EntityTarget, EntityType } from '@kobato/db/sqlite/target'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { decrementMetricVotesTx } from '@kobato/db/sqlite/operations/system/metric'
import { comment } from '@kobato/db/sqlite/schema/comment'
import { like, metric } from '@kobato/db/sqlite/schema/metric'
import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'

function whereLikeTarget(target: EntityTarget) {
  return and(eq(like.type, target.type), eq(like.ownerId, target.ownerId))
}

export async function recordLikeAndCount(db: Database, token: string, target: EntityTarget): Promise<number> {
  return sqliteOf(db).transaction((tx) => {
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

export function consumeActiveLikeTokenTx(tx: NodeSQLiteDatabase, target: EntityTarget, token: string): boolean {
  const now = new Date()
  const rows = tx
    .update(like)
    .set({ updatedAt: now, deletedAt: now })
    .where(and(eq(like.token, token), whereLikeTarget(target), isNull(like.deletedAt)))
    .returning({ id: like.id })
    .all()
  return rows.length > 0
}

export async function metricVoteUp(db: Database, target: EntityTarget): Promise<number> {
  const rows = await sqliteOf(db)
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

export async function metricsByOwnerIds(db: Database, type: EntityType, ownerIds: number[]): Promise<MetricsRow[]> {
  if (ownerIds.length === 0) {
    return []
  }
  const rows = await sqliteOf(db)
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

export async function commentCountsByOwnerIds(
  db: Database,
  type: EntityType,
  ownerIds: number[],
): Promise<TargetCommentCountRow[]> {
  if (ownerIds.length === 0) {
    return []
  }
  const rows = await sqliteOf(db)
    .select({ ownerId: comment.ownerId, count: sql<number>`COUNT(*)`.mapWith(Number) })
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
    .map((r) => ({ ownerId: r.ownerId, count: r.count }))
}

export async function purgeOldLikeTokens(db: Database, before: Date): Promise<void> {
  await sqliteOf(db)
    .delete(like)
    .where(and(isNotNull(like.deletedAt), lt(like.deletedAt, before)))
}

export async function existsActiveLikeToken(db: Database, target: EntityTarget, token: string): Promise<boolean> {
  const rows = await sqliteOf(db)
    .select({ id: like.id })
    .from(like)
    .where(and(eq(like.token, token), whereLikeTarget(target), isNull(like.deletedAt)))
    .limit(1)
  return rows.length > 0
}

export function consumeLikeAndDecrement(db: Database, target: EntityTarget, token: string): boolean {
  return sqliteOf(db).transaction((tx) => {
    const consumed = consumeActiveLikeTokenTx(tx, target, token)
    if (consumed) {
      decrementMetricVotesTx(tx, target)
    }
    return consumed
  })
}
