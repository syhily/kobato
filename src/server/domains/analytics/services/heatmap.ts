import type { AnalyticsReader } from '@/server/domains/analytics/services/duckdb-sql'
import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { HeatmapCell } from '@/shared/contracts/analytics'

import { whereClause } from '@/server/domains/analytics/services/duckdb-sql'

export async function queryHeatmap(reader: AnalyticsReader, input: AnalyticsQueryInput): Promise<HeatmapCell[]> {
  const where = whereClause(input)
  // EXTRACT on the TIMESTAMP column — same UTC semantics as the old
  // `EXTRACT(DOW/HOUR FROM ts)` against a UTC-set Postgres.
  const result = await reader.runAndReadAll(
    `SELECT
      EXTRACT(dow FROM ts) AS weekday,
      EXTRACT(hour FROM ts) AS hour,
      COUNT(*) AS visits,
      COUNT(DISTINCT visitor_hash) AS visitors
    FROM access_log
    WHERE ${where.sql}
    GROUP BY weekday, hour`,
    where.params,
  )
  const rows = result.getRowObjects()
  return rows.map((row) => ({
    weekday: Number(row.weekday),
    hour: Number(row.hour),
    visits: Number(row.visits),
    visitors: Number(row.visitors),
  }))
}
