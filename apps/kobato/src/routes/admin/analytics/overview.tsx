import { requireRole } from '@kobato/server/domains/auth/rbac.ts'
import { createSsrCaller } from '@kobato/server/http/ssr-caller.ts'
import { AnalyticsDashboard } from '@kobato/web/ui/admin/analytics/AnalyticsDashboard.tsx'
import { ExportButton } from '@kobato/web/ui/admin/analytics/ExportButton.tsx'
import { useAnalyticsState } from '@kobato/web/ui/admin/analytics/use-analytics-state.ts'

import type { Route } from './+types/overview'

// Server-rendered first paint; client-side fetchers take over once the URL state changes. The `search` string
// carries the raw query string, parsed server-side.
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
