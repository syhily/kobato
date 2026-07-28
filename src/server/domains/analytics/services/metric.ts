import { sql } from 'drizzle-orm'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { Database } from '@/server/infra/db/database'
import type { MetricRow, MetricType } from '@/shared/contracts/analytics'

import { whereClause, quoteIdent, METRIC_SET } from '@/server/domains/analytics/services/shared-sql'
import { DomainError } from '@/server/infra/http/errors'
import { isRecord } from '@/shared/utils/type-guards'

export async function queryMetric(
  db: Database,
  input: AnalyticsQueryInput,
  type: MetricType,
  limit = 20,
): Promise<MetricRow[]> {
  if (!METRIC_SET.has(type)) {
    throw new DomainError('BAD_REQUEST', `unknown metric type: ${type}`)
  }
  const where = whereClause(input)
  const groupExpr = sql`COALESCE(NULLIF(${quoteIdent(type)}, ''), '(unknown)')`
  const rows = db.all(sql`
    SELECT
      ${groupExpr} AS name,
      COUNT(*) AS visits,
      COUNT(DISTINCT visitor_hash) AS visitors
    FROM access_log
    WHERE ${where}
    GROUP BY name
    ORDER BY visits DESC
    LIMIT ${limit}
  `)
  return rows.map((row) => {
    if (!isRecord(row)) {
      return { name: '', visits: 0, visitors: 0 }
    }
    return {
      name: typeof row.name === 'string' ? row.name : '',
      visits: Number(row.visits),
      visitors: Number(row.visitors),
    }
  })
}
