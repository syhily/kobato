import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { AggregateSource, CountersDto, MetricType } from '@/shared/contracts/analytics'

import {
  METRIC_SET,
  STATS_DAILY_DIMENSIONS,
  STATS_HOURLY_DIMENSIONS,
  cagWhereClause,
  whereClause,
} from '@/server/domains/analytics/services/shared-sql'
import { pickAggregateSource } from '@/shared/contracts/analytics'

function isMetricType(key: string): key is MetricType {
  return METRIC_SET.has(key)
}

/**
 * Decide whether the chosen aggregate can honour every active filter dimension.
 * If a filter references a column that is not rolled up in the aggregate, we
 * fall back to the raw `access_log` table so the result stays exact.
 */
function supportsDimensions(source: AggregateSource, filters: AnalyticsQueryInput['filters']): boolean {
  if (source === 'access_log') {
    return true
  }
  const usable = source === 'stats_hourly' ? STATS_HOURLY_DIMENSIONS : STATS_DAILY_DIMENSIONS
  for (const [key, value] of Object.entries(filters)) {
    if (!isMetricType(key) || !value) {
      continue
    }
    if (!usable.has(key)) {
      return false
    }
  }
  return true
}

export async function queryCounters(db: NodePgDatabase, input: AnalyticsQueryInput): Promise<CountersDto> {
  const source = pickAggregateSource(input.range)
  const effectiveSource = supportsDimensions(source, input.filters) ? source : 'access_log'

  let visits: number

  if (effectiveSource === 'access_log') {
    const where = whereClause(input)
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::bigint AS visits,
        COUNT(DISTINCT visitor_hash)::bigint AS visitors
      FROM access_log
      WHERE ${where}
    `)
    const row = result.rows[0] as { visits?: string | number | null; visitors?: string | number | null } | undefined
    visits = Number(row?.visits ?? 0)
    const visitors = Number(row?.visitors ?? 0)
    const referers = await queryReferers(db, input)
    return { visits, visitors, referers }
  }

  // Visits are additive across buckets, so the pre-rolled aggregate is safe.
  const where = cagWhereClause(input, effectiveSource)
  const result = await db.execute(sql`
    SELECT
      SUM(visits)::bigint AS visits
    FROM ${sql.raw(effectiveSource)}
    WHERE ${where}
  `)
  visits = Number((result.rows[0] as { visits?: string | number | null } | undefined)?.visits ?? 0)

  // `visitor_hash` and `referer_host` distinct counts are not additive across
  // buckets, so they are always computed from the raw table to keep results
  // unchanged from the previous all-raw implementation.
  const rawResult = await db.execute(sql`
    SELECT
      COUNT(DISTINCT visitor_hash)::bigint AS visitors,
      COUNT(DISTINCT referer_host) FILTER (WHERE referer_host IS NOT NULL AND referer_host <> '')::bigint AS referers
    FROM access_log
    WHERE ${whereClause(input)}
  `)
  const rawRow = rawResult.rows[0] as
    | { visitors?: string | number | null; referers?: string | number | null }
    | undefined

  return {
    visits,
    visitors: Number(rawRow?.visitors ?? 0),
    referers: Number(rawRow?.referers ?? 0),
  }
}

async function queryReferers(db: NodePgDatabase, input: AnalyticsQueryInput): Promise<number> {
  const result = await db.execute(sql`
    SELECT
      COUNT(DISTINCT referer_host) FILTER (WHERE referer_host IS NOT NULL AND referer_host <> '')::bigint AS referers
    FROM access_log
    WHERE ${whereClause(input)}
  `)
  return Number((result.rows[0] as { referers?: string | number | null } | undefined)?.referers ?? 0)
}
