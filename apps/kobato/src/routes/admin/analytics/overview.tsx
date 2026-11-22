import { requireRole } from '@kobato/server/domains/auth/rbac'
import { createSsrCaller } from '@kobato/server/http/ssr-caller'
import { AnalyticsDashboard } from '@kobato/web-admin/ui/analytics/AnalyticsDashboard'
import { useAnalyticsState } from '@kobato/web-admin/ui/analytics/use-analytics-state'

import type { Route } from './+types/overview'

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  requireRole(viewer ?? undefined, 'admin')
  const url = new URL(request.url)
  return caller.admin.analytics.overview({ search: url.searchParams.toString() })
}

export default function WpAdminAnalyticsOverview({ loaderData }: Route.ComponentProps) {
  const state = useAnalyticsState()
  return <AnalyticsDashboard data={loaderData} state={state} />
}
