import { sql } from 'drizzle-orm'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { Database } from '@/server/infra/db/database'
import type { ViewsPoint } from '@/shared/contracts/analytics'

import { whereClause } from '@/server/domains/analytics/services/shared-sql'
import { pickTimeBucketMs } from '@/shared/contracts/analytics'
import { isRecord } from '@/shared/utils/type-guards'

export async function queryViews(db: Database, input: AnalyticsQueryInput): Promise<ViewsPoint[]> {
  const bucketMs = pickTimeBucketMs(input.range)
  const where = whereClause(input)

  // Buckets by integer epoch-ms division — `ts` is an epoch-ms integer,
  // so `(ts / bucket) * bucket` is the bucket start, also epoch ms.
  const rows = db.all(sql`
    SELECT
      (ts / ${bucketMs}) * ${bucketMs} AS time,
      COUNT(*) AS visits,
      COUNT(DISTINCT visitor_hash) AS visitors
    FROM access_log
    WHERE ${where}
    GROUP BY time
    ORDER BY time
  `)
  return rows.map((row) => {
    if (!isRecord(row)) {
      return { time: '', visits: 0, visitors: 0 }
    }
    return {
      time: new Date(Number(row.time)).toISOString(),
      visits: Number(row.visits),
      visitors: Number(row.visitors),
    }
  })
}
