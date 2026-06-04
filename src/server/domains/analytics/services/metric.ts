import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { MetricRow, MetricType } from '@/shared/contracts/analytics'

import { whereClause, quoteIdent, METRIC_SET } from '@/server/domains/analytics/services/shared-sql'
import { DomainError } from '@/server/infra/http/errors'

export async function queryMetric(
  db: NodePgDatabase,
  input: AnalyticsQueryInput,
  type: MetricType,
  limit = 20,
): Promise<MetricRow[]> {
  if (!METRIC_SET.has(type)) {
    throw new DomainError('BAD_REQUEST', `unknown metric type: ${type}`)
  }
  const where = whereClause(input)
  const groupExpr = sql`COALESCE(NULLIF(${quoteIdent(type)}, ''), '(unknown)')`
  const result = await db.execute(sql`
    SELECT
      ${groupExpr} AS name,
      COUNT(*)::bigint AS visits,
      COUNT(DISTINCT visitor_hash)::bigint AS visitors
    FROM access_log
    WHERE ${where}
    GROUP BY name
    ORDER BY visits DESC
    LIMIT ${limit}
  `)
  return result.rows.map((row) => {
    const r = row as { name: string; visits: string | number; visitors: string | number }
    return {
      name: r.name,
      visits: Number(r.visits),
      visitors: Number(r.visitors),
    }
  })
}
