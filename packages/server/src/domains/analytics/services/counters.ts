import type { CountersDto, ResolvedAnalyticsQuery } from '@kobato/shared/contracts/analytics.ts'

import type { AnalyticsReader } from './analytics-sql'

import { visitAggregates } from './aggregates'
import { createAnalyticsQuery, runAnalyticsQuery } from './analytics-sql'
import { buildAnalyticsFilter } from './query-filter'

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
