import type { ResolvedAnalyticsQuery, TimeUnit, ViewsDto, ViewsPoint } from '@kobato/contracts/analytics.ts'
import type { AnalyticsReader } from '@kobato/db/duckdb/query.ts'

import { pickTimeUnit } from '@kobato/contracts/analytics.ts'
import { visitorsAggregate } from '@kobato/db/duckdb/queries/aggregates.ts'
import { buildAnalyticsFilter, getSafeTimezone } from '@kobato/db/duckdb/queries/query-filter.ts'
import { createAnalyticsQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query.ts'
import { sql } from 'kysely'

/** strftime bucket format per unit — server-side, timezone-aware bucketing. */
const UNIT_FORMAT: Record<TimeUnit, string> = {
  minute: '%Y-%m-%d %H:%M',
  hour: '%Y-%m-%d %H',
  day: '%Y-%m-%d',
}

export async function queryViews(reader: AnalyticsReader, input: ResolvedAnalyticsQuery): Promise<ViewsDto> {
  const unit = input.unit ?? pickTimeUnit(input.range)
  const clientTimezone = getSafeTimezone(input.clientTimezone ?? 'Etc/UTC')

  const rows = await runAnalyticsQuery(
    reader,
    createAnalyticsQuery()
      .select([
        sql<string>`strftime(timezone(${clientTimezone}, ${sql.ref('timestamp')}), ${UNIT_FORMAT[unit]})`.as('time'),
        sql<number>`COUNT(*)`.as('visits'),
        visitorsAggregate,
      ])
      .where(buildAnalyticsFilter(input))
      .groupBy('time')
      .orderBy('time'),
    'views',
  )
  const points: ViewsPoint[] = rows.map((row) => ({
    time: typeof row.time === 'string' ? row.time : '',
    visits: Number(row.visits),
    visitors: Number(row.visitors),
  }))
  return { unit, clientTimezone, points }
}
