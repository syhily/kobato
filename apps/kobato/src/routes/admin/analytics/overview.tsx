import { requireRole } from '@kobato/server/domains/auth/rbac.ts'
import { createSsrCaller } from '@kobato/server/http/ssr-caller.ts'
import { AnalyticsDashboard } from '@kobato/web-admin/ui/analytics/AnalyticsDashboard.tsx'
import { ExportButton } from '@kobato/web-admin/ui/analytics/ExportButton.tsx'
import { useAnalyticsState } from '@kobato/web-admin/ui/analytics/use-analytics-state.ts'

import type { Route } from './+types/overview'

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
