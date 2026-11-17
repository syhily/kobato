import { blobColumns } from '@kobato/db/duckdb/access-events.ts'
import { sql } from 'kysely'

/**
 * The shared visit aggregates over the access_events slot contracts — columns
 * come from `blobColumns`, never a literal slot number. Counters and export
 * MUST both select from `visitAggregates` so they count the same thing; views,
 * heatmap, and metric reuse `visitorsAggregate`. Columns are qualified with
 * `access_events.` (the query-filter convention) so the fragments are also
 * valid on the env-dimension metric query's JOIN.
 */

/** Distinct daily-salted visitor hash — the ONLY visitor identifier ever stored. */
export const visitorsAggregate = sql<number>`COUNT(DISTINCT ${sql.ref(`access_events.${blobColumns.visitorHash}`)})`.as(
  'visitors',
)

/** Distinct non-empty referer hosts. */
const referersAggregate =
  sql<number>`COUNT(DISTINCT NULLIF(${sql.ref(`access_events.${blobColumns.refererHost}`)}, ${''}))`.as('referers')

export function visitAggregates(visitsAlias: string) {
  return [sql<number>`COUNT(*)`.as(visitsAlias), visitorsAggregate, referersAggregate]
}
