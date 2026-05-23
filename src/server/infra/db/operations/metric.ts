import { and, eq, sql } from 'drizzle-orm'

import type { EntityTarget } from '@/server/infra/db/target'
import type { MetricRow, NewMetric } from '@/server/infra/db/types'

import { db } from '@/server/infra/db/pool'
import { metric } from '@/server/infra/db/schema/metric'
import { targetKey } from '@/server/infra/db/target'

export type { MetricRow } from '@/server/infra/db/types'

// Filter clause used everywhere we look up a metric by entity target.
// Drizzle's `and(eq, eq)` plus the partial-unique index
// `uq_metric_owner` (on `(type, owner_id) WHERE … NOT NULL`) keeps
// reads index-only.
function whereTarget(target: EntityTarget) {
  return and(eq(metric.type, target.type), eq(metric.ownerId, target.ownerId))
}

/**
 * Atomic upsert of a metric row keyed on the entity target. Returns
 * the canonical row, including the auto-generated `publicId` UUID
 * that the public API surfaces in place of an URL.
 *
 * - When the row does not yet exist we insert defaults; the
 *   schema's `$defaultFn` mints a fresh `publicId`.
 * - When it already exists we touch `updatedAt` so the RETURNING
 *   clause hands the caller back a fresh row without changing
 *   semantics. (No counter or `publicId` rewrite — those are
 *   handled by their own paths.)
 */
export async function ensureMetric(target: EntityTarget): Promise<MetricRow> {
  const np: NewMetric = {
    type: target.type,
    ownerId: target.ownerId,
    voteUp: 0,
    voteDown: 0,
    pv: 0,
  }
  const result = await db
    .insert(metric)
    .values(np)
    .onConflictDoUpdate({
      target: [metric.type, metric.ownerId],
      set: { updatedAt: sql`${metric.updatedAt}` },
    })
    .returning()
  return result[0]
}

/** Batch upsert of metric rows. One SQL round-trip regardless of batch size. */
export async function ensureMetricsBatch(targets: EntityTarget[]): Promise<MetricRow[]> {
  if (targets.length === 0) {
    return []
  }
  const values = targets.map((t) => ({
    type: t.type,
    ownerId: t.ownerId,
    voteUp: 0,
    voteDown: 0,
    pv: 0,
  }))
  return db
    .insert(metric)
    .values(values)
    .onConflictDoUpdate({
      target: [metric.type, metric.ownerId],
      set: { updatedAt: sql`${metric.updatedAt}` },
    })
    .returning()
}

export async function findMetricByPublicId(publicId: string): Promise<MetricRow | null> {
  const rows = await db.select().from(metric).where(eq(metric.publicId, publicId)).limit(1)
  return rows[0] ?? null
}

export async function findMetricByTarget(target: EntityTarget): Promise<MetricRow | null> {
  const rows = await db.select().from(metric).where(whereTarget(target)).limit(1)
  return rows[0] ?? null
}

export async function incrementMetricPv(target: EntityTarget, delta = 1): Promise<void> {
  if (delta <= 0) {
    return
  }
  await db
    .update(metric)
    .set({ pv: sql`${metric.pv} + ${delta}` })
    .where(whereTarget(target))
}

/**
 * Apply many `pv += delta` updates in a single SQL statement using
 * `UPDATE ... FROM (VALUES ...)` so the round-trip count is one
 * regardless of batch size. The map is keyed on the composite string
 * `"<type>:<ownerId>"` (see `targetKey`) so callers can use a regular
 * `Map<string, number>` without juggling tuples.
 */
export async function incrementMetricPvBatch(deltas: Map<string, number>): Promise<void> {
  const positive: Array<[string, string, number]> = []
  for (const [composite, delta] of deltas) {
    if (delta <= 0) {
      continue
    }
    const idx = composite.indexOf(':')
    if (idx <= 0) {
      continue
    }
    const type = composite.slice(0, idx)
    const ownerId = composite.slice(idx + 1)
    if ((type !== 'post' && type !== 'page') || ownerId === '') {
      continue
    }
    positive.push([type, ownerId, delta])
  }
  if (positive.length === 0) {
    return
  }

  const rows = sql.join(
    positive.map(([type, ownerId, delta]) => sql`(${type}::varchar(16), ${ownerId}::bigint, ${delta}::bigint)`),
    sql`, `,
  )

  await db.execute(sql`
    UPDATE ${metric}
    SET    pv = COALESCE(${metric.pv}, 0) + v.delta
    FROM   (VALUES ${rows}) AS v(type, owner_id, delta)
    WHERE  ${metric.type} = v.type
      AND  ${metric.ownerId} = v.owner_id
  `)
}

export async function decrementMetricVotes(target: EntityTarget): Promise<void> {
  await db
    .update(metric)
    .set({ voteUp: sql`GREATEST(${metric.voteUp} - 1, 0)` })
    .where(whereTarget(target))
}

export { targetKey }
