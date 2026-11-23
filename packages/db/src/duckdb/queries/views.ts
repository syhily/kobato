import type { AnalyticsReader } from '@kobato/db/duckdb/connection'
import type { ResolvedAnalyticsQuery, ViewsPoint, ViewsSeries } from '@kobato/db/duckdb/queries/types'
import type { TimeUnit } from '@kobato/utils/date-range'

import { visitorsAggregate } from '@kobato/db/duckdb/queries/aggregates'
import { buildAnalyticsFilter, getSafeTimezone } from '@kobato/db/duckdb/queries/query-filter'
import { analyticsIdentifier, createAnalyticsQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query'
import { pickTimeUnit } from '@kobato/utils/date-range'
import { sql } from 'drizzle-orm'

const UNIT_FORMAT: Record<TimeUnit, string> = {
  minute: '%Y-%m-%d %H:%M',
  hour: '%Y-%m-%d %H',
  day: '%Y-%m-%d',
}

export async function queryViews(reader: AnalyticsReader, input: ResolvedAnalyticsQuery): Promise<ViewsSeries> {
  const unit = input.unit ?? pickTimeUnit(input.range)
  const clientTimezone = getSafeTimezone(input.clientTimezone ?? 'Etc/UTC')

  const rows = await runAnalyticsQuery(
    reader,
    createAnalyticsQuery({
      time: sql<string>`strftime(timezone(${clientTimezone}, ${analyticsIdentifier('access_events.timestamp')}), ${UNIT_FORMAT[unit]})`,
      visits: sql<number>`COUNT(*)`,
      visitors: visitorsAggregate,
    })
      .where(buildAnalyticsFilter(input))
      .groupBy(sql`time`)
      .orderBy(sql`time`),
    'views',
  )
  const points: ViewsPoint[] = rows.map((row) => ({
    time: typeof row.time === 'string' ? row.time : '',
    visits: Number(row.visits),
    visitors: Number(row.visitors),
  }))
  return { unit, clientTimezone, points }
}
