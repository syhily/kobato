import { and, eq, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { EntityTarget } from '@/server/infra/db/target'
import type { MetricRow, NewMetric } from '@/server/infra/db/types'

import { metric } from '@/server/infra/db/schema/metric'

// Matches `uq_metric_owner` — a plain UNIQUE on `(type, owner_id)`, both NOT NULL.
function whereTarget(target: EntityTarget) {
  return and(eq(metric.type, target.type), eq(metric.ownerId, target.ownerId))
}

/**
 * Ensure-once read, read-first/insert-only-when-missing (audit P1-14);
 * the `ON CONFLICT` no-op is the concurrent-create race fallback.
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

/** One SQL round-trip regardless of batch size. */
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

/** Many `pv += delta` updates in one sync transaction; the map key is `"<type>:<ownerId>"`. */
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

  db.transaction((tx) => {
    for (const [type, ownerId, delta] of positive) {
      tx.update(metric)
        .set({ pv: sql`COALESCE(${metric.pv}, 0) + ${delta}` })
        .where(and(eq(metric.type, type), eq(metric.ownerId, ownerId)))
        .run()
    }
  })
}

// Sync (node:sqlite): called inside the unlike transaction; MAX(a, b) is scalar here, not the aggregate.
export function decrementMetricVotes(db: Database, target: EntityTarget): void {
  db.update(metric)
    .set({ voteUp: sql`MAX(${metric.voteUp} - 1, 0)` })
    .where(whereTarget(target))
    .run()
}
