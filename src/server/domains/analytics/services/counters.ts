import type { AnalyticsReader } from '@/server/domains/analytics/services/analytics-sql'
import type { CountersDto, ResolvedAnalyticsQuery } from '@/shared/contracts/analytics'

import { visitAggregates } from '@/server/domains/analytics/services/aggregates'
import { createAnalyticsQuery, runAnalyticsQuery } from '@/server/domains/analytics/services/analytics-sql'
import { buildAnalyticsFilter } from '@/server/domains/analytics/services/query-filter'

export async function queryCounters(reader: AnalyticsReader, input: ResolvedAnalyticsQuery): Promise<CountersDto> {
  const rows = await runAnalyticsQuery(
    reader,
    createAnalyticsQuery().select(visitAggregates('visits')).where(buildAnalyticsFilter(input)),
  )
  const row = rows[0]
  return {
    visits: Number(row?.visits ?? 0),
    visitors: Number(row?.visitors ?? 0),
    referers: Number(row?.referers ?? 0),
  }
}
