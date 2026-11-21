import type { DateRange } from '@kobato/utils/date-range'
import type { RawBuilder } from 'kysely'

import { index1Of } from '@kobato/db/duckdb/access-events'
import { METRIC_DIMENSIONS, dimensionWhere } from '@kobato/db/duckdb/queries/metric-dimensions'
import { METRIC_TYPES, type AnalyticsRangeInput, type ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types'
import { computeDateRange } from '@kobato/utils/date-range'
import { sql } from 'kysely'

export function buildAnalyticsFilter(query: ResolvedAnalyticsQuery): RawBuilder<boolean> {
  const filters: RawBuilder<boolean>[] = [
    sql<boolean>`${sql.ref('access_events.is_bot')} = FALSE`,
    sql<boolean>`${sql.ref('access_events.timestamp')} >= to_timestamp(${query.range.startAt})`,
    sql<boolean>`${sql.ref('access_events.timestamp')} < to_timestamp(${query.range.endAt})`,
  ]

  if (query.entityType && query.entityId !== undefined) {
    filters.push(sql<boolean>`${sql.ref('access_events.index1')} = ${index1Of(query.entityType, query.entityId)}`)
  }

  if (query.includeUnknown !== true) {
    filters.push(sql<boolean>`${sql.ref('access_events.blob7')} <> ''`)
  }

  for (const type of METRIC_TYPES) {
    const value = query[type]
    if (typeof value !== 'string' || value === '') {
      continue
    }
    const values = value.split(',').filter(Boolean)
    if (values.length > 0) {
      filters.push(dimensionWhere(METRIC_DIMENSIONS[type], values))
    }
  }

  return sql<boolean>`${sql.join(filters, sql` and `)}`
}

export function resolveAnalyticsRange(query: AnalyticsRangeInput): DateRange {
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
