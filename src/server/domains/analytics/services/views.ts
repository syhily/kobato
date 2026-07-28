import type { AnalyticsReader } from '@/server/domains/analytics/services/duckdb-sql'
import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { ViewsPoint } from '@/shared/contracts/analytics'

import { timestampToMs, whereClause } from '@/server/domains/analytics/services/duckdb-sql'
import { pickTimeBucketMs } from '@/shared/contracts/analytics'

const BUCKET_INTERVAL: Record<number, string> = {
  60_000: '1 minute',
  900_000: '15 minutes',
  3_600_000: '1 hour',
  86_400_000: '1 day',
}

export async function queryViews(reader: AnalyticsReader, input: AnalyticsQueryInput): Promise<ViewsPoint[]> {
  const bucketMs = pickTimeBucketMs(input.range)
  const interval = BUCKET_INTERVAL[bucketMs]
  const where = whereClause(input)

  // DuckDB-native `time_bucket` on a real TIMESTAMP — the Postgres
  // original carried over nearly verbatim.
  const result = await reader.runAndReadAll(
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
  const rows = result.getRowObjects()
  return rows.map((row) => {
    return {
      time: new Date(timestampToMs(row.time)).toISOString(),
      visits: Number(row.visits),
      visitors: Number(row.visitors),
    }
  })
}
