import type { RawBuilder } from 'kysely'

import { sql } from 'kysely'

import { index1Of } from '@/server/domains/analytics/services/access-log'
import {
  METRIC_TYPES,
  analyticsQuerySchema,
  computeDateRange,
  type AnalyticsQuery,
  type DateRange,
  type MetricType,
  type ResolvedAnalyticsQuery,
} from '@/shared/contracts/analytics'

/**
 * The shared analytics WHERE builder: every dashboard query filters
 * `is_bot = FALSE`, the resolved [startAt, endAt) range (unix seconds,
 * bound through `to_timestamp(?)`), optional entity scoping (`index1`)
 * and per-dimension equality filters (comma-separated → `IN (...)`).
 * User values travel as bound parameters only.
 */

// Metric dimension → blob slot. `referer` filters the referer HOST,
// matching the metric grouping (the full referer is never a filter).
export const DIMENSION_COLUMN: Record<MetricType, string> = {
  country: 'blob7',
  region: 'blob8',
  city: 'blob9',
  referer: 'blob3',
  language: 'blob6',
  timezone: 'blob10',
  os: 'blob11',
  browser: 'blob12',
  browserType: 'blob13',
  device: 'blob14',
  deviceType: 'blob15',
  path: 'blob1',
}

export function buildAnalyticsFilter(query: ResolvedAnalyticsQuery): RawBuilder<boolean> {
  const filters: RawBuilder<boolean>[] = [
    sql<boolean>`is_bot = FALSE`,
    sql<boolean>`${sql.ref('timestamp')} >= to_timestamp(${query.range.startAt})`,
    sql<boolean>`${sql.ref('timestamp')} < to_timestamp(${query.range.endAt})`,
  ]

  if (query.entityType && query.entityId !== undefined) {
    filters.push(sql<boolean>`${sql.ref('index1')} = ${index1Of(query.entityType, query.entityId)}`)
  }

  for (const type of METRIC_TYPES) {
    const value = query[type]
    if (typeof value !== 'string' || value === '') {
      continue
    }
    const values = value.split(',').filter(Boolean)
    if (values.length > 0) {
      filters.push(sql<boolean>`${sql.ref(DIMENSION_COLUMN[type])} in (${sql.join(values)})`)
    }
  }

  return sql<boolean>`${sql.join(filters, sql` and `)}`
}

/** Range resolution: an explicit valid [startAt, endAt) pair wins; otherwise the preset (default last-7d). */
export function resolveAnalyticsRange(query: Pick<AnalyticsQuery, 'preset' | 'startAt' | 'endAt'>): DateRange {
  if (query.startAt !== undefined && query.endAt !== undefined && query.endAt > query.startAt) {
    return { startAt: query.startAt, endAt: query.endAt }
  }
  return computeDateRange(query.preset ?? 'last-7d')
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz }).resolvedOptions()
    return true
  } catch {
    return false
  }
}

export function getSafeTimezone(tz: string): string {
  return isValidTimezone(tz) ? tz : 'Etc/UTC'
}

const SEARCH_KEYS = ['preset', 'startAt', 'endAt', 'entityType', 'entityId', 'unit', 'clientTimezone', 'limit'] as const

/**
 * URL-grammar entry point for callers whose input is a query string (the
 * route loaders' `search`): lenient per field, validated through the
 * shared zod schema.
 */
export function parseAnalyticsSearch(searchParams: URLSearchParams): ResolvedAnalyticsQuery {
  const fields: Record<string, string> = {}
  for (const key of [...SEARCH_KEYS, ...METRIC_TYPES]) {
    const value = searchParams.get(key)
    if (value !== null) {
      fields[key] = value
    }
  }

  let parsed = analyticsQuerySchema.safeParse(fields)
  if (!parsed.success) {
    // A poisonous field (control characters, oversized value) drops the
    // dimension filters, never the whole query.
    for (const type of METRIC_TYPES) {
      delete fields[type]
    }
    parsed = analyticsQuerySchema.safeParse(fields)
  }
  const query = parsed.success ? parsed.data : analyticsQuerySchema.parse({})
  return { ...query, range: resolveAnalyticsRange(query) }
}
