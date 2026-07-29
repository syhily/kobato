import type { DuckDBConnection, DuckDBValue } from '@duckdb/node-api'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { MetricType } from '@/shared/contracts/analytics'

import { DomainError } from '@/server/infra/http/errors'
import { METRIC_TYPES } from '@/shared/contracts/analytics'

const METRIC_SET = new Set<string>(METRIC_TYPES)

function isMetricType(key: string): key is MetricType {
  return METRIC_SET.has(key)
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
export function quoteIdent(name: MetricType): string {
  const col = METRIC_COLUMN[name]
  if (!col) {
    throw new DomainError('BAD_REQUEST', `invalid identifier: ${name}`)
  }
  return `"${col}"`
}

export interface WhereParts {
  sql: string
  params: DuckDBValue[]
}

/**
 * Bind expression for an epoch-ms BIGINT parameter as a DuckDB
 * TIMESTAMP. JS bigints bind as HUGEINT in the node API, so the
 * `?::BIGINT` cast is load-bearing — centralised here because every
 * analytics query needs it and a typo silently breaks the predicate.
 */
export const EPOCH_MS_PARAM = 'epoch_ms(?::BIGINT)'

// `ts` is a DuckDB TIMESTAMP; range inputs are epoch seconds, bound as
// epoch-ms BIGINTs through `epoch_ms(?::BIGINT)`.
export function whereClause(input: AnalyticsQueryInput): WhereParts {
  const conditions: string[] = ['is_bot = FALSE', `ts >= ${EPOCH_MS_PARAM}`, `ts < ${EPOCH_MS_PARAM}`]
  const params: DuckDBValue[] = [BigInt(input.range.startAt * 1000), BigInt(input.range.endAt * 1000)]
  if (input.entityType) {
    conditions.push('entity_type = ?')
    params.push(input.entityType)
  }
  if (input.entityId !== undefined) {
    conditions.push('entity_id = ?')
    params.push(BigInt(input.entityId))
  }
  for (const [type, value] of Object.entries(input.filters)) {
    if (!isMetricType(type) || !value) {
      continue
    }
    conditions.push(`${quoteIdent(type)} = ?`)
    params.push(value)
  }
  return { sql: conditions.join(' AND '), params }
}

/** The dashboard read connection type (DuckDB MVCC reader). */
export type AnalyticsReader = DuckDBConnection

/** Convert a DuckDB TIMESTAMP result cell to epoch milliseconds. The
 *  node API surfaces timestamps as microseconds since epoch — either a
 *  raw bigint or an object carrying a `micros` bigint. */
export function timestampToMs(value: DuckDBValue): number {
  if (typeof value === 'bigint') {
    return Number(value / 1000n)
  }
  if (value !== null && typeof value === 'object' && 'micros' in value && typeof value.micros === 'bigint') {
    return Number(value.micros / 1000n)
  }
  return 0
}

export { METRIC_SET, METRIC_COLUMN }
