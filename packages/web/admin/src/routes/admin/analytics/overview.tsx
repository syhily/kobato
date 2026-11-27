import { orpc } from '@kobato/api/browser/client'
import { awaitRootBootstrap, requireRoleFromBootstrap } from '@kobato/web-admin/lib/root-bootstrap'
import { AnalyticsDashboard } from '@kobato/web-admin/ui/analytics/AnalyticsDashboard'
import { useAnalyticsState } from '@kobato/web-admin/ui/analytics/use-analytics-state'

import type { Route } from './+types/overview'

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'admin', { pathname: new URL(request.url).pathname })
  const url = new URL(request.url)
  return orpc.admin.analytics.overview({ search: url.searchParams.toString() })
}

export default function WpAdminAnalyticsOverview({ loaderData }: Route.ComponentProps) {
  const state = useAnalyticsState()
  return <AnalyticsDashboard data={loaderData} state={state} />
}
