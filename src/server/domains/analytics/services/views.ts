import type { AnalyticsReader } from '@/server/domains/analytics/services/duckdb-sql'
import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { ViewsPoint } from '@/shared/contracts/analytics'

import {
  queryAnalyticsRows,
  timeBucketInterval,
  timestampToMs,
  whereClause,
} from '@/server/domains/analytics/services/duckdb-sql'
import { pickTimeBucketMs } from '@/shared/contracts/analytics'

export async function queryViews(reader: AnalyticsReader, input: AnalyticsQueryInput): Promise<ViewsPoint[]> {
  const interval = timeBucketInterval(pickTimeBucketMs(input.range))
  const where = whereClause(input)

  // DuckDB-native `time_bucket` on a real TIMESTAMP (Postgres original).
  const rows = await queryAnalyticsRows(
    reader,
    `SELECT
      time_bucket(INTERVAL '${interval}', ts) AS time,
      COUNT(*) AS visits,
      COUNT(DISTINCT visitor_hash) AS visitors
    FROM access_log
    WHERE ${where.sql}
    GROUP BY time
    ORDER BY time`,
    where.params,
  )
  return rows.map((row) => {
    return {
      time: new Date(timestampToMs(row.time)).toISOString(),
      visits: Number(row.visits),
      visitors: Number(row.visitors),
    }
  })
}
