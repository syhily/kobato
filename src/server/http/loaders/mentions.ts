import { getAnalyticsReader } from '@/server/bootstrap/analytics-lifecycle'
import { queryMetric } from '@/server/domains/analytics/services/metric'
import { parseAnalyticsSearch } from '@/server/domains/analytics/services/query-parser'

/**
 * Mentions page data: top referers for the parsed range. Owns the
 * analytics-handle projection so route modules stay wire-only (routes
 * never import bootstrap).
 */
export async function loadMentionsReferers(searchParams: URLSearchParams) {
  const input = parseAnalyticsSearch(searchParams)
  const referers = await queryMetric(getAnalyticsReader(), input, 'referer', 50)
  return { referers }
}
