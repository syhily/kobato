import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { ViewsPoint } from '@/shared/contracts/analytics'

import { whereClause, cagWhereClause } from '@/server/domains/analytics/services/shared-sql'
import { pickAggregateSource, pickTimeBucket } from '@/shared/contracts/analytics'
import { isRecord } from '@/shared/utils/type-guards'

export async function queryViews(db: NodePgDatabase, input: AnalyticsQueryInput): Promise<ViewsPoint[]> {
  const bucket = pickTimeBucket(input.range)
  const source = pickAggregateSource(input.range)
  const where = whereClause(input)

  const select =
    source === 'access_log'
      ? sql`
        SELECT
          time_bucket(${bucket}::interval, ts) AS time,
          COUNT(*)::bigint AS visits,
          COUNT(DISTINCT visitor_hash)::bigint AS visitors
        FROM access_log
        WHERE ${where}
        GROUP BY time
        ORDER BY time
      `
      : source === 'stats_hourly'
        ? sql`
          SELECT
            time_bucket(${bucket}::interval, bucket) AS time,
            SUM(visits)::bigint AS visits,
            SUM(visitors)::bigint AS visitors
          FROM stats_hourly
          WHERE ${cagWhereClause(input)}
          GROUP BY time
          ORDER BY time
        `
        : sql`
          SELECT
            time_bucket(${bucket}::interval, bucket) AS time,
            SUM(visits)::bigint AS visits,
            SUM(visitors)::bigint AS visitors
          FROM stats_daily
          WHERE ${cagWhereClause(input)}
          GROUP BY time
          ORDER BY time
        `

  const result = await db.execute(select)
  return result.rows.map((row) => {
    if (!isRecord(row)) {
      return { time: '', visits: 0, visitors: 0 }
    }
    const time = row.time
    const visits = row.visits
    const visitors = row.visitors
    return {
      time: (time instanceof Date ? time : new Date(String(time))).toISOString(),
      visits: Number(visits),
      visitors: Number(visitors),
    }
  })
}
