import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { CountersDto } from '@/shared/contracts/analytics'

import { whereClause } from '@/server/domains/analytics/services/shared-sql'

export async function queryCounters(db: NodePgDatabase, input: AnalyticsQueryInput): Promise<CountersDto> {
  const where = whereClause(input)
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::bigint AS visits,
      COUNT(DISTINCT visitor_hash)::bigint AS visitors,
      COUNT(DISTINCT referer_host) FILTER (WHERE referer_host IS NOT NULL AND referer_host <> '')::bigint AS referers
    FROM access_log
    WHERE ${where}
  `)
  const row = result.rows[0] as
    | { visits?: string | number | null; visitors?: string | number | null; referers?: string | number | null }
    | undefined
  return {
    visits: Number(row?.visits ?? 0),
    visitors: Number(row?.visitors ?? 0),
    referers: Number(row?.referers ?? 0),
  }
}
