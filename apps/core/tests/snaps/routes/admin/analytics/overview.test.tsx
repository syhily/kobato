import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'

import { describe, expect, it } from 'vitest'

import AnalyticsOverviewRoute from '@/routes/admin/analytics/overview'

describe('snapshot: routes/admin/analytics/overview', () => {
  it('renders the analytics overview route', () => {
    const Route = asRoute(AnalyticsOverviewRoute)
    const html = stableHtml(
      renderInRouter(
        <Route
          loaderData={{
            counters: { visits: 0, visitors: 0, referers: 0 },
            views: [],
            heatmap: [],
            initialMetrics: {},
          }}
        />,
        '/admin/analytics',
      ),
    )
    expect(html).toContain('趋势')
    expect(html).toContain('热力')
  })
})
