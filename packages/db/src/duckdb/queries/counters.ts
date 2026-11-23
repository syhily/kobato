import type { AnalyticsReader } from '@kobato/db/duckdb/connection'
import type { CountersSummary, ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types'

import { visitAggregates } from '@kobato/db/duckdb/queries/aggregates'
import { buildAnalyticsFilter } from '@kobato/db/duckdb/queries/query-filter'
import { createAnalyticsQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query'

export async function queryCounters(reader: AnalyticsReader, input: ResolvedAnalyticsQuery): Promise<CountersSummary> {
  const rows = await runAnalyticsQuery(
    reader,
    createAnalyticsQuery(visitAggregates('visits')).where(buildAnalyticsFilter(input)),
    'counters',
  )
  const row = rows[0]
  return {
    visits: Number(row?.visits ?? 0),
    visitors: Number(row?.visitors ?? 0),
    referers: Number(row?.referers ?? 0),
  }
}
