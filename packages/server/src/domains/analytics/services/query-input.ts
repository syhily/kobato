import type { ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types.ts'

import { METRIC_TYPES, analyticsQuerySchema } from '@kobato/contracts/analytics.ts'
import { resolveAnalyticsRange } from '@kobato/db/duckdb/queries/query-filter.ts'

const SEARCH_KEYS = [
  'preset',
  'startAt',
  'endAt',
  'entityType',
  'entityId',
  'unit',
  'clientTimezone',
  'limit',
  'includeUnknown',
] as const

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
    for (const type of METRIC_TYPES) {
      delete fields[type]
    }
    parsed = analyticsQuerySchema.safeParse(fields)
  }
  const query = parsed.success ? parsed.data : analyticsQuerySchema.parse({})
  return { ...query, range: resolveAnalyticsRange(query) }
}
