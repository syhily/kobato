import type { CountersDto, ResolvedAnalyticsQuery } from '@kobato/contracts/analytics.ts'
import type { AnalyticsReader } from '@kobato/db/duckdb/query.ts'

import { visitAggregates } from '@kobato/db/duckdb/queries/aggregates.ts'
import { buildAnalyticsFilter } from '@kobato/db/duckdb/queries/query-filter.ts'
import { createAnalyticsQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query.ts'

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
