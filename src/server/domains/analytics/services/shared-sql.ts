import { sql, type SQL } from 'drizzle-orm'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { MetricType } from '@/shared/contracts/analytics'

import { DomainError } from '@/server/infra/http/errors'
import { METRIC_TYPES, pickAggregateSource } from '@/shared/contracts/analytics'

const METRIC_SET = new Set<string>(METRIC_TYPES)

function isMetricType(key: string): key is MetricType {
  return (
    key === 'country' ||
    key === 'region' ||
    key === 'city' ||
    key === 'referer' ||
    key === 'language' ||
    key === 'timezone' ||
    key === 'os' ||
    key === 'browser' ||
    key === 'browserType' ||
    key === 'device' ||
    key === 'deviceType' ||
    key === 'path'
  )
}

const METRIC_COLUMN: Record<MetricType, string> = {
  country: 'country',
  region: 'region',
  city: 'city',
  referer: 'referer_host',
  language: 'language',
  timezone: 'timezone',
  os: 'os',
  browser: 'browser',
  browserType: 'browser',
  device: 'device',
  deviceType: 'device_type',
  path: 'path',
}

/**
 * Quote a column identifier for use in raw SQL.
 * The parameter type is constrained to MetricType so only columns from
 * the hard-coded METRIC_COLUMN map can be passed — never user input.
 */
export function quoteIdent(name: MetricType): SQL {
  const col = METRIC_COLUMN[name]
  if (!col) {
    throw new DomainError('BAD_REQUEST', `invalid identifier: ${name}`)
  }
  return sql.raw(`"${col}"`)
}

export function whereClause(input: AnalyticsQueryInput): SQL {
  const conditions: SQL[] = [
    sql`is_bot = FALSE`,
    sql`ts >= to_timestamp(${input.range.startAt})`,
    sql`ts < to_timestamp(${input.range.endAt})`,
  ]
  if (input.entityType) {
    conditions.push(sql`entity_type = ${input.entityType}`)
  }
  if (input.entityId !== undefined) {
    conditions.push(sql`entity_id = ${input.entityId}`)
  }
  for (const [type, value] of Object.entries(input.filters)) {
    if (!isMetricType(type) || !value) {
      continue
    }
    conditions.push(sql`${quoteIdent(type)} = ${value}`)
  }
  return sql.join(conditions, sql` AND `)
}

export function cagWhereClause(input: AnalyticsQueryInput): SQL {
  const conditions: SQL[] = [
    sql`bucket >= to_timestamp(${input.range.startAt})`,
    sql`bucket < to_timestamp(${input.range.endAt})`,
  ]
  if (input.entityType) {
    conditions.push(sql`entity_type = ${input.entityType}`)
  }
  if (input.entityId !== undefined) {
    conditions.push(sql`entity_id = ${input.entityId}`)
  }
  for (const [type, value] of Object.entries(input.filters)) {
    const hourlyDims = new Set(['country', 'browser', 'os', 'deviceType', 'path'])
    const dailyDims = new Set(['country', 'path'])
    const usable = pickAggregateSource(input.range) === 'stats_hourly' ? hourlyDims : dailyDims
    if (!isMetricType(type) || !value || !usable.has(type)) {
      continue
    }
    conditions.push(sql`${quoteIdent(type)} = ${value}`)
  }
  return sql.join(conditions, sql` AND `)
}

export { METRIC_SET, METRIC_COLUMN }
