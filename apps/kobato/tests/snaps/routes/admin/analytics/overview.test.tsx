import { asRoute } from '@kobato/test/route-test-utils'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
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
