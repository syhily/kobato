import { METRIC_TYPES, analyticsQuerySchema, type ResolvedAnalyticsQuery } from '@kobato/contracts/analytics.ts'
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

/**
 * URL-grammar entry point for callers whose input is a query string (the
 * controllers' `search`): lenient per field, validated through the shared
 * zod schema; range resolution stays in `@kobato/db`'s query-filter.
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
