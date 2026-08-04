import type { Database } from '@kobato/server/infra/db/database'
import type { EntityTarget } from '@kobato/server/infra/db/target'
import type { MetricRow, NewMetric } from '@kobato/server/infra/db/types'

import { metric } from '@kobato/server/infra/db/schema/metric'
import { and, eq, sql } from 'drizzle-orm'

// Filter clause used everywhere we look up a metric by entity target.
// It matches the unique index `uq_metric_owner` (a plain UNIQUE on
// `(type, owner_id)` — both columns are NOT NULL, so no partial WHERE
// is needed), which drives the lookup (fix-review comment correction:
// the index is not partial and the SELECT returns full rows, so the
// read is index-driven, not index-only).
function whereTarget(target: EntityTarget) {
  return and(eq(metric.type, target.type), eq(metric.ownerId, target.ownerId))
}

/**
 * Ensure-once read of the metric row keyed on the entity target. Returns
 * the canonical row, including the auto-generated `publicId` UUID
 * that the public API surfaces in place of an URL.
 *
 * Read-first, insert-only-when-missing: the detail render path calls
 * this on every page view and the row virtually always exists, so the
 * common path is a pure SELECT (driven by the `uq_metric_owner` index)
 * that takes no SQLite write lock. The previous single-statement
 * `INSERT … ON CONFLICT DO UPDATE` acquired a write lock per render
 * (audit P1-14); its SET was a self-assignment no-op, so skipping the
 * write changes nothing observable.
 *
 * - When the row exists we return it as-is — no `updatedAt` touch, no
 *   counter or `publicId` rewrite (same as the old no-op SET).
 * - When it does not yet exist we insert defaults; the schema's
 *   `$defaultFn` mints a fresh `publicId`. The `ON CONFLICT` no-op is
 *   kept as the concurrent-create race fallback: two writers passing
 *   the SELECT concurrently both end up returning the one canonical row.
 */
export async function ensureMetric(db: Database, target: EntityTarget): Promise<MetricRow> {
  const existing = await findMetricByTarget(db, target)
  if (existing !== null) {
    return existing
  }
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
