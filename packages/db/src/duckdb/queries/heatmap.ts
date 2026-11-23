import type { AnalyticsReader } from '@kobato/db/duckdb/connection'
import type { HeatmapCell, ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types'

import { visitorsAggregate } from '@kobato/db/duckdb/queries/aggregates'
import { buildAnalyticsFilter, getSafeTimezone } from '@kobato/db/duckdb/queries/query-filter'
import { analyticsIdentifier, createAnalyticsQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query'
import { sql } from 'drizzle-orm'

export async function queryHeatmap(reader: AnalyticsReader, input: ResolvedAnalyticsQuery): Promise<HeatmapCell[]> {
  const clientTimezone = getSafeTimezone(input.clientTimezone ?? 'Etc/UTC')
  const tzTimestamp = sql`timezone(${clientTimezone}, ${analyticsIdentifier('access_events.timestamp')})`

  const rows = await runAnalyticsQuery(
    reader,
    createAnalyticsQuery({
      weekday: sql<number>`isodow(${tzTimestamp})`,
      hour: sql<number>`hour(${tzTimestamp})`,
      visits: sql<number>`COUNT(*)`,
      visitors: visitorsAggregate,
    })
      .where(buildAnalyticsFilter(input))
      .groupBy(sql`weekday`, sql`hour`)
      .orderBy(sql`weekday`, sql`hour`),
    'heatmap',
  )
  return rows.map((row) => ({
    weekday: Number(row.weekday),
    hour: Number(row.hour),
    visits: Number(row.visits),
    visitors: Number(row.visitors),
  }))
}
