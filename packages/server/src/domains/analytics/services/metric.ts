import type { AnalyticsReader } from '@kobato/server/domains/analytics/services/duckdb-sql'
import type { AnalyticsQueryInput } from '@kobato/server/domains/analytics/services/query-parser'
import type { MetricRow, MetricType } from '@kobato/shared/contracts/analytics'

import { queryAnalyticsRows, quoteIdent, whereClause } from '@kobato/server/domains/analytics/services/duckdb-sql'

export async function queryMetric(
  reader: AnalyticsReader,
  input: AnalyticsQueryInput,
  type: MetricType,
  limit = 20,
): Promise<MetricRow[]> {
  // `type` arrives already validated at the wire boundary (zod enum).
  const where = whereClause(input)
  const rows = await queryAnalyticsRows(
    reader,
    `SELECT
      COALESCE(NULLIF(${quoteIdent(type)}, ''), '(unknown)') AS name,
      COUNT(*) AS visits,
      COUNT(DISTINCT visitor_hash) AS visitors
    FROM access_log
    WHERE ${where.sql}
    GROUP BY name
    ORDER BY visits DESC
    LIMIT ?`,
    [...where.params, BigInt(limit)],
  )
  return rows.map((row) => ({
    name: typeof row.name === 'string' ? row.name : '',
    visits: Number(row.visits),
    visitors: Number(row.visitors),
  }))
}
