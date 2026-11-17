import type { ResolvedAnalyticsQuery } from '@kobato/contracts/analytics.ts'
import type { AnalyticsReader } from '@kobato/db/duckdb/query.ts'

import { visitAggregates } from '@kobato/db/duckdb/queries/aggregates.ts'
import { buildAnalyticsFilter } from '@kobato/db/duckdb/queries/query-filter.ts'
import { createAnalyticsQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query.ts'
import { sql } from 'kysely'

/** One aggregated export row: per-path views, distinct visitors, distinct referer hosts. */
export interface AnalyticsExportRow {
  path: string
  views: number
  visitors: number
  referers: number
}

/** CSV export rows grouped by path — the CSV assembly (headers, escaping, CRLF) stays in `@kobato/server`. */
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
      // The wire schema already clamps `limit` to ≤500.
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
