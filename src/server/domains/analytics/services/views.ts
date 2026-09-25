import { sql } from 'kysely'

import type { AnalyticsReader } from '@/server/domains/analytics/services/analytics-sql'
import type { ResolvedAnalyticsQuery, TimeUnit, ViewsDto, ViewsPoint } from '@/shared/contracts/analytics'

import { createAnalyticsQuery, runAnalyticsQuery } from '@/server/domains/analytics/services/analytics-sql'
import { buildAnalyticsFilter, getSafeTimezone } from '@/server/domains/analytics/services/query-filter'
import { pickTimeUnit } from '@/shared/contracts/analytics'

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
        sql<number>`COUNT(DISTINCT ${sql.ref('blob5')})`.as('visitors'),
      ])
      .where(buildAnalyticsFilter(input))
      .groupBy('time')
      .orderBy('time'),
  )
  const points: ViewsPoint[] = rows.map((row) => ({
    time: typeof row.time === 'string' ? row.time : '',
    visits: Number(row.visits),
    visitors: Number(row.visitors),
  }))
  return { unit, clientTimezone, points }
}
