import type { AnalyticsReader } from '@kobato/server/domains/analytics/services/analytics-sql.ts'
import type { CountersDto, ResolvedAnalyticsQuery } from '@kobato/shared/contracts/analytics.ts'

import { visitAggregates } from '@kobato/server/domains/analytics/services/aggregates.ts'
import { createAnalyticsQuery, runAnalyticsQuery } from '@kobato/server/domains/analytics/services/analytics-sql.ts'
import { buildAnalyticsFilter } from '@kobato/server/domains/analytics/services/query-filter.ts'

export async function queryCounters(reader: AnalyticsReader, input: ResolvedAnalyticsQuery): Promise<CountersDto> {
  const rows = await runAnalyticsQuery(
    reader,
    createAnalyticsQuery().select(visitAggregates('visits')).where(buildAnalyticsFilter(input)),
    'counters',
  )
  const row = rows[0]
  return {
    visits: Number(row?.visits ?? 0),
    visitors: Number(row?.visitors ?? 0),
    referers: Number(row?.referers ?? 0),
  }
}
