import type { HeatmapCell, ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types.ts'
import type { AnalyticsReader } from '@kobato/db/duckdb/query.ts'

import { visitorsAggregate } from '@kobato/db/duckdb/queries/aggregates.ts'
import { buildAnalyticsFilter, getSafeTimezone } from '@kobato/db/duckdb/queries/query-filter.ts'
import { createAnalyticsQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query.ts'
import { sql } from 'kysely'

export async function queryHeatmap(reader: AnalyticsReader, input: ResolvedAnalyticsQuery): Promise<HeatmapCell[]> {
  const clientTimezone = getSafeTimezone(input.clientTimezone ?? 'Etc/UTC')
  const tzTimestamp = sql`timezone(${clientTimezone}, ${sql.ref('timestamp')})`

  // `isodow`: 1 = Monday … 7 = Sunday, in the client timezone.
  const rows = await runAnalyticsQuery(
    reader,
    createAnalyticsQuery()
      .select([
        sql<number>`isodow(${tzTimestamp})`.as('weekday'),
        sql<number>`hour(${tzTimestamp})`.as('hour'),
        sql<number>`COUNT(*)`.as('visits'),
        visitorsAggregate,
      ])
      .where(buildAnalyticsFilter(input))
      .groupBy(['weekday', 'hour'])
      .orderBy('weekday')
      .orderBy('hour'),
    'heatmap',
  )
  return rows.map((row) => ({
    weekday: Number(row.weekday),
    hour: Number(row.hour),
    visits: Number(row.visits),
    visitors: Number(row.visitors),
  }))
}
