import type { AnalyticsReader } from '@kobato/db/duckdb/connection'
import type { ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types'

import { visitAggregates } from '@kobato/db/duckdb/queries/aggregates'
import { buildAnalyticsFilter } from '@kobato/db/duckdb/queries/query-filter'
import { createAnalyticsQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query'
import { accessEvents } from '@kobato/db/duckdb/schema'
import { desc, sql } from 'drizzle-orm'

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
    createAnalyticsQuery({ path: accessEvents.blob1, ...visitAggregates('views') })
      .where(buildAnalyticsFilter(input))
      .groupBy(accessEvents.blob1)
      .orderBy(desc(sql`views`))
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
