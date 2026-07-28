import { and, eq, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { EntityTarget } from '@/server/infra/db/target'
import type { MetricRow, NewMetric } from '@/server/infra/db/types'

import { metric } from '@/server/infra/db/schema/metric'

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
export async function ensureMetric(db: Database, target: EntityTarget): Promise<MetricRow> {
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
export async function ensureMetricsBatch(db: Database, targets: EntityTarget[]): Promise<MetricRow[]> {
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

export async function findMetricByPublicId(db: Database, publicId: string): Promise<MetricRow | null> {
  const rows = await db.select().from(metric).where(eq(metric.publicId, publicId)).limit(1)
  return rows[0] ?? null
}

export async function findMetricByTarget(db: Database, target: EntityTarget): Promise<MetricRow | null> {
  const rows = await db.select().from(metric).where(whereTarget(target)).limit(1)
  return rows[0] ?? null
}

/**
 * Apply many `pv += delta` updates as per-row increments inside one sync
 * transaction (the batch is bounded — ≤ 50 keys per flush — so N tiny
 * updates cost microseconds). The map is keyed on the composite string
 * `"<type>:<ownerId>"` (see `targetKey`) so callers can use a regular
 * `Map<string, number>` without juggling tuples.
 */
export async function incrementMetricPvBatch(db: Database, deltas: Map<string, number>): Promise<void> {
  const positive: Array<['post' | 'page', number, number]> = []
  for (const [composite, delta] of deltas) {
    if (delta <= 0) {
      continue
    }
    const idx = composite.indexOf(':')
    if (idx <= 0) {
      continue
    }
    const type = composite.slice(0, idx)
    const ownerId = Number(composite.slice(idx + 1))
    if ((type !== 'post' && type !== 'page') || !Number.isSafeInteger(ownerId)) {
      continue
    }
    positive.push([type, ownerId, delta])
  }
  if (positive.length === 0) {
    return
  }

  // Per-row increments in one sync transaction — SQLite has no typed
  // VALUES-column aliasing for the old UPDATE…FROM shape, and the flush
  // is bounded (≤ 50 keys) so N tiny updates cost microseconds.
  db.transaction((tx) => {
    for (const [type, ownerId, delta] of positive) {
      tx.update(metric)
        .set({ pv: sql`COALESCE(${metric.pv}, 0) + ${delta}` })
        .where(and(eq(metric.type, type), eq(metric.ownerId, ownerId)))
        .run()
    }
  })
}

// Sync (node:sqlite): called inside the unlike transaction. `MAX(a, b)`
// is SQLite's scalar GREATEST.
export function decrementMetricVotes(db: Database, target: EntityTarget): void {
  db.update(metric)
    .set({ voteUp: sql`MAX(${metric.voteUp} - 1, 0)` })
    .where(whereTarget(target))
    .run()
}
