import type { AnalyticsReader } from '@kobato/server/domains/analytics/services/duckdb-sql'
import type { AnalyticsQueryInput } from '@kobato/server/domains/analytics/services/query-parser'
import type { CountersDto } from '@kobato/shared/contracts/analytics'

import { queryAnalyticsRows, whereClause } from '@kobato/server/domains/analytics/services/duckdb-sql'

export async function queryCounters(reader: AnalyticsReader, input: AnalyticsQueryInput): Promise<CountersDto> {
  const where = whereClause(input)
  const rows = await queryAnalyticsRows(
    reader,
    `SELECT
      COUNT(*) AS visits,
      COUNT(DISTINCT visitor_hash) AS visitors,
      COUNT(DISTINCT referer_host) FILTER (WHERE referer_host IS NOT NULL AND referer_host <> '') AS referers
    FROM access_log
    WHERE ${where.sql}`,
    where.params,
  )
  const row = rows[0]
  return {
    visits: Number(row?.visits ?? 0),
    visitors: Number(row?.visitors ?? 0),
    referers: Number(row?.referers ?? 0),
  }
}
