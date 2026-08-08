import type { DuckDBConnection, DuckDBValue } from '@duckdb/node-api'

import type { AnalyticsQueryInput } from '@/server/domains/analytics/services/query-parser'
import type { MetricType } from '@/shared/contracts/analytics'

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
 * Quote a column identifier for raw SQL. Safe by construction: `MetricType`
 * can only name a column from the hard-coded `METRIC_COLUMN` map — never user input.
 */
export function quoteIdent(name: MetricType): string {
  return `"${METRIC_COLUMN[name]}"`
}

export interface WhereParts {
  sql: string
  params: DuckDBValue[]
}

/**
 * Bind expression for an epoch-ms BIGINT parameter as a DuckDB TIMESTAMP.
 * JS bigints bind as HUGEINT in the node API, so the `?::BIGINT` cast is
 * load-bearing — a typo here silently breaks every analytics predicate.
 */
export const EPOCH_MS_PARAM = 'epoch_ms(?::BIGINT)'

/** The Date-as-epoch-ms-BIGINT parameter for `EPOCH_MS_PARAM`. The pair
 *  must travel together — a hand-rolled `BigInt(d.getTime())` breaks the
 *  predicate just as silently. */
export function epochMsParam(d: Date): bigint {
  return BigInt(d.getTime())
}

/**
 * Run a read query and materialize row objects. The one owner of the
 * `runAndReadAll` → `getRowObjects` idiom; modules keep only their SQL
 * and row mapper.
 */
export async function queryAnalyticsRows(
  reader: AnalyticsReader,
  sql: string,
  params: DuckDBValue[],
): Promise<Record<string, DuckDBValue>[]> {
  const result = await reader.runAndReadAll(sql, params)
  return result.getRowObjects()
}

const BUCKET_INTERVAL: Record<number, string> = {
  60_000: '1 minute',
  900_000: '15 minutes',
  3_600_000: '1 hour',
  86_400_000: '1 day',
}

/**
 * The DuckDB INTERVAL literal for a `pickTimeBucketMs` width. An
 * unmapped width fails loudly here instead of producing `INTERVAL 'undefined'`.
 */
export function timeBucketInterval(bucketMs: number): string {
  const interval = BUCKET_INTERVAL[bucketMs]
  if (interval === undefined) {
    throw new Error(`unmapped time bucket width: ${bucketMs}ms`)
  }
  return interval
}

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

/** DuckDB MVCC reader connection. */
export type AnalyticsReader = DuckDBConnection

/** Convert a DuckDB TIMESTAMP result cell to epoch milliseconds. The
 *  node API surfaces timestamps as microseconds since epoch — a raw
 *  bigint or an object carrying a `micros` bigint. */
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
