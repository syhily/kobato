import type { LoaderFunctionArgs } from 'react-router'

import type { AnalyticsOverviewData } from '@/server/domains/analytics/services/overview'

import { loadAnalyticsOverview } from '@/server/domains/analytics/services/overview'
import { parseAnalyticsSearch } from '@/server/domains/analytics/services/query-parser'
import { requireRole } from '@/server/domains/auth/rbac'
import { getRequestContext } from '@/server/http/request-context'

// Site-wide analytics overview behind `routes/admin/analytics/overview.tsx`:
// admin gate + URL-shaped input parsing, then the domain fan-out. The
// route module keeps context extraction, this one call, and rendering.
export async function loadAdminAnalyticsOverview({
  request,
  context,
}: Pick<LoaderFunctionArgs, 'request' | 'context'>): Promise<AnalyticsOverviewData> {
  const rc = getRequestContext({ request, context })
  requireRole({ user: rc.viewer ?? undefined, role: rc.viewer?.role ?? null }, 'admin')

  const url = new URL(request.url)
  const input = parseAnalyticsSearch(url.searchParams)

  return loadAnalyticsOverview(rc.db, input)
}
