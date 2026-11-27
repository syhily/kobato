import { asRoute } from '@kobato/test/route-test-utils'
import AnalyticsOverviewRoute from '@kobato/web-admin/routes/admin/analytics/overview'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

describe('snapshot: routes/admin/analytics/overview', () => {
  it('renders the analytics overview route', () => {
    const Route = asRoute(AnalyticsOverviewRoute)
    const html = stableHtml(
      renderInRouter(
        <Route
          loaderData={{
            counters: { visits: 0, visitors: 0, referers: 0 },
            initialMetrics: {},
          }}
        />,
        '/admin/analytics',
      ),
    )
    expect(html).toContain('趋势')
    expect(html).toContain('每周趋势')
  })
})
