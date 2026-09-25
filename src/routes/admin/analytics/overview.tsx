import { requireRole } from '@/server/domains/auth/rbac'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { AnalyticsDashboard } from '@/ui/admin/analytics/AnalyticsDashboard'
import { ExportButton } from '@/ui/admin/analytics/ExportButton'
import { useAnalyticsState } from '@/ui/admin/analytics/use-analytics-state'

import type { Route } from './+types/overview'

// Fan out all dashboard queries in parallel so the first paint is fully
// populated; client-side fetchers take over once the URL state changes. The
// `search` string carries the raw query string, parsed server-side.
export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  requireRole(viewer ?? undefined, 'admin')
  const url = new URL(request.url)
  return caller.analytics.overview({ search: url.searchParams.toString() })
}

export default function WpAdminAnalyticsOverview({ loaderData }: Route.ComponentProps) {
  const state = useAnalyticsState()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <ExportButton state={state} />
      </div>
      <AnalyticsDashboard data={loaderData} state={state} />
    </div>
  )
}
