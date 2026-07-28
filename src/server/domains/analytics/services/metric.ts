import type { AnalyticsReader } from '@/server/domains/analytics/services/duckdb-sql'
import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { MetricRow, MetricType } from '@/shared/contracts/analytics'

import { METRIC_SET, quoteIdent, whereClause } from '@/server/domains/analytics/services/duckdb-sql'
import { DomainError } from '@/server/infra/http/errors'

export async function queryMetric(
  reader: AnalyticsReader,
  input: AnalyticsQueryInput,
  type: MetricType,
  limit = 20,
): Promise<MetricRow[]> {
  if (!METRIC_SET.has(type)) {
    throw new DomainError('BAD_REQUEST', `unknown metric type: ${type}`)
  }
  const where = whereClause(input)
  const result = await reader.runAndReadAll(
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
  const rows = result.getRowObjects()
  return rows.map((row) => ({
    name: typeof row.name === 'string' ? row.name : '',
    visits: Number(row.visits),
    visitors: Number(row.visitors),
  }))
}
