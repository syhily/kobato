import { sql } from 'drizzle-orm'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { Database } from '@/server/infra/db/database'
import type { CountersDto } from '@/shared/contracts/analytics'

import { whereClause } from '@/server/domains/analytics/services/shared-sql'

export async function queryCounters(db: Database, input: AnalyticsQueryInput): Promise<CountersDto> {
  const where = whereClause(input)
  const rows = db.all(sql`
    SELECT
      COUNT(*) AS visits,
      COUNT(DISTINCT visitor_hash) AS visitors,
      COUNT(DISTINCT CASE WHEN referer_host IS NOT NULL AND referer_host <> '' THEN referer_host END) AS referers
    FROM access_log
    WHERE ${where}
  `)
  const row = rows[0] as { visits?: number | null; visitors?: number | null; referers?: number | null } | undefined
  return {
    visits: Number(row?.visits ?? 0),
    visitors: Number(row?.visitors ?? 0),
    referers: Number(row?.referers ?? 0),
  }
}
