import { sql, type SQL } from 'drizzle-orm'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'

import { DomainError } from '@/server/infra/http/errors'
import { METRIC_TYPES, pickAggregateSource } from '@/shared/contracts/analytics'

const METRIC_SET = new Set<string>(METRIC_TYPES)

const METRIC_COLUMN: Record<import('@/shared/contracts/analytics').MetricType, string> = {
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

export function quoteIdent(name: string): SQL {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new DomainError('BAD_REQUEST', `invalid identifier: ${name}`)
  }
  return sql.raw(`"${name}"`)
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
    if (!METRIC_SET.has(type) || !value) {
      continue
    }
    const col = METRIC_COLUMN[type as import('@/shared/contracts/analytics').MetricType]
    conditions.push(sql`${quoteIdent(col)} = ${value}`)
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
    if (!usable.has(type) || !value) {
      continue
    }
    const col = METRIC_COLUMN[type as import('@/shared/contracts/analytics').MetricType]
    conditions.push(sql`${quoteIdent(col)} = ${value}`)
  }
  return sql.join(conditions, sql` AND `)
}

export { METRIC_SET, METRIC_COLUMN }
