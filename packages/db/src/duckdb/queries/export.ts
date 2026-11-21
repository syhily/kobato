import type { ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types'
import type { AnalyticsReader } from '@kobato/db/duckdb/query'

import { visitAggregates } from '@kobato/db/duckdb/queries/aggregates'
import { buildAnalyticsFilter } from '@kobato/db/duckdb/queries/query-filter'
import { createAnalyticsQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query'
import { sql } from 'kysely'

export interface AnalyticsExportRow {
  path: string
  views: number
  visitors: number
  referers: number
}

export async function queryExportRows(
  reader: AnalyticsReader,
  input: ResolvedAnalyticsQuery,
): Promise<AnalyticsExportRow[]> {
  const rows = await runAnalyticsQuery(
    reader,
    createAnalyticsQuery()
      .select([sql.ref('blob1').as('path'), ...visitAggregates('views')])
      .where(buildAnalyticsFilter(input))
      .groupBy('path')
      .orderBy('views', 'desc')
      .limit(input.limit ?? 500),
    'export',
  )
  return rows.map((row) => ({
    path: typeof row.path === 'string' ? row.path : '',
    views: Number(row.views ?? 0),
    visitors: Number(row.visitors ?? 0),
    referers: Number(row.referers ?? 0),
  }))
}
