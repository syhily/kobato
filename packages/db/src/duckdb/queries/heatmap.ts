import type { AnalyticsReader } from '@kobato/db/duckdb/connection'
import type { HeatmapCell, ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types'

import { visitorsAggregate } from '@kobato/db/duckdb/queries/aggregates'
import { buildAnalyticsFilter, getSafeTimezone } from '@kobato/db/duckdb/queries/query-filter'
import { createAnalyticsQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query'
import { sql } from 'kysely'

export async function queryHeatmap(reader: AnalyticsReader, input: ResolvedAnalyticsQuery): Promise<HeatmapCell[]> {
  const clientTimezone = getSafeTimezone(input.clientTimezone ?? 'Etc/UTC')
  const tzTimestamp = sql`timezone(${clientTimezone}, ${sql.ref('timestamp')})`

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
