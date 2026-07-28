import { sql } from 'drizzle-orm'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { Database } from '@/server/infra/db/database'
import type { HeatmapCell } from '@/shared/contracts/analytics'

import { whereClause } from '@/server/domains/analytics/services/shared-sql'
import { isRecord } from '@/shared/utils/type-guards'

export async function queryHeatmap(db: Database, input: AnalyticsQueryInput): Promise<HeatmapCell[]> {
  const where = whereClause(input)
  // `ts` is epoch ms; strftime computes UTC weekday/hour — same semantics
  // as the old `EXTRACT(DOW/HOUR FROM ts)` against a UTC-set Postgres.
  const rows = db.all(sql`
    SELECT
      CAST(strftime('%w', ts / 1000, 'unixepoch') AS INTEGER) AS weekday,
      CAST(strftime('%H', ts / 1000, 'unixepoch') AS INTEGER) AS hour,
      COUNT(*) AS visits,
      COUNT(DISTINCT visitor_hash) AS visitors
    FROM access_log
    WHERE ${where}
    GROUP BY weekday, hour
  `)
  return rows.map((row) => {
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
