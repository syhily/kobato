import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { HeatmapCell } from '@/shared/contracts/analytics'

import { whereClause } from '@/server/domains/analytics/services/shared-sql'
import { isRecord } from '@/shared/utils/type-guards'

export async function queryHeatmap(db: NodePgDatabase, input: AnalyticsQueryInput): Promise<HeatmapCell[]> {
  const where = whereClause(input)
  const result = await db.execute(sql`
    SELECT
      EXTRACT(DOW FROM ts)::int AS weekday,
      EXTRACT(HOUR FROM ts)::int AS hour,
      COUNT(*)::bigint AS visits,
      COUNT(DISTINCT visitor_hash)::bigint AS visitors
    FROM access_log
    WHERE ${where}
    GROUP BY weekday, hour
  `)
  return result.rows.map((row) => {
    if (!isRecord(row)) {
      return { weekday: 0, hour: 0, visits: 0, visitors: 0 }
    }
    return {
      weekday: Number(row.weekday),
      hour: Number(row.hour),
      visits: Number(row.visits),
      visitors: Number(row.visitors),
    }
  })
}
