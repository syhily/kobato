import { sql } from 'kysely'

import type { AnalyticsReader } from '@/server/domains/analytics/services/analytics-sql'
import type { HeatmapCell, ResolvedAnalyticsQuery } from '@/shared/contracts/analytics'

import { createAnalyticsQuery, runAnalyticsQuery } from '@/server/domains/analytics/services/analytics-sql'
import { buildAnalyticsFilter, getSafeTimezone } from '@/server/domains/analytics/services/query-filter'

export async function queryHeatmap(reader: AnalyticsReader, input: ResolvedAnalyticsQuery): Promise<HeatmapCell[]> {
  const clientTimezone = getSafeTimezone(input.clientTimezone ?? 'Etc/UTC')
  const tzTimestamp = sql`timezone(${clientTimezone}, ${sql.ref('timestamp')})`

  // ISO weekday semantics: 1 = Monday … 7 = Sunday, in the client timezone.
  const rows = await runAnalyticsQuery(
    reader,
    createAnalyticsQuery()
      .select([
        sql<number>`isodow(${tzTimestamp})`.as('weekday'),
        sql<number>`hour(${tzTimestamp})`.as('hour'),
        sql<number>`COUNT(*)`.as('visits'),
        sql<number>`COUNT(DISTINCT ${sql.ref('blob5')})`.as('visitors'),
      ])
      .where(buildAnalyticsFilter(input))
      .groupBy(['weekday', 'hour'])
      .orderBy('weekday')
      .orderBy('hour'),
  )
  return rows.map((row) => ({
    weekday: Number(row.weekday),
    hour: Number(row.hour),
    visits: Number(row.visits),
    visitors: Number(row.visitors),
  }))
}
