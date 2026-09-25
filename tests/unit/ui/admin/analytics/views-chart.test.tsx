import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter } from '#/_helpers/render'
import { AnalyticsStateProvider } from '@/ui/admin/analytics/analytics-state-context'
import { useAnalyticsState } from '@/ui/admin/analytics/use-analytics-state'
import { ViewsChart } from '@/ui/admin/analytics/ViewsChart'

// The ViewsChart query contract: the client derives the bucket `unit` from
// the resolved range and always sends `clientTimezone`. The oRPC query-utils
// module is mocked to capture the exact input object; react-query uses the
// canonical mock (pending query → the component stays on the SSR skeleton
// branch, so no chart chunk is needed). The URL state is hoisted to the
// route module, so the harness mimics the route composition: real
// useAnalyticsState → provider → panel.

const control = mockTanstackQuery()

const captured = vi.hoisted(() => ({ inputs: [] as Record<string, unknown>[] }))

vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: {
    analytics: {
      views: {
        queryOptions: (options: { input: Record<string, unknown> }) => {
          captured.inputs.push(options.input)
          return { queryKey: ['analytics', 'views', options.input] }
        },
      },
    },
  },
}))

function ViewsChartRouteHarness() {
  const state = useAnalyticsState()
  return (
    <AnalyticsStateProvider state={state}>
      <ViewsChart />
    </AnalyticsStateProvider>
  )
}

function renderChart(path: string) {
  captured.inputs.length = 0
  renderInRouter(<ViewsChartRouteHarness />, path)
  return captured.inputs[0]!
}

describe('ui/admin/analytics/ViewsChart query input', () => {
  beforeEach(() => {
    captured.inputs.length = 0
    control.query.data = null
    control.query.isFetching = false
    control.query.isError = false
  })

  it('sends the minute unit for a ≤1h range', () => {
    const input = renderChart('/admin/analytics?startAt=1000&endAt=4600')
    expect(input.unit).toBe('minute')
    expect(input.startAt).toBe(1000)
    expect(input.endAt).toBe(4600)
  })

  it('sends the hour unit for a ≤1d range', () => {
    const input = renderChart('/admin/analytics?startAt=1000&endAt=44200')
    expect(input.unit).toBe('hour')
  })

  it('sends the day unit for a multi-day range', () => {
    const input = renderChart('/admin/analytics?startAt=1000&endAt=269200')
    expect(input.unit).toBe('day')
  })

  it('always attaches the resolved client timezone', () => {
    const input = renderChart('/admin/analytics?startAt=1000&endAt=4600')
    expect(input.clientTimezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('forwards per-dimension filters from the URL', () => {
    const input = renderChart('/admin/analytics?startAt=1000&endAt=4600&country=CN&browser=Chrome')
    expect(input.country).toBe('CN')
    expect(input.browser).toBe('Chrome')
  })

  it('sends the preset instead of the explicit range when a preset is active', () => {
    const input = renderChart('/admin/analytics?preset=last-1h')
    expect(input.preset).toBe('last-1h')
    expect(input.startAt).toBeUndefined()
    expect(input.endAt).toBeUndefined()
    // last-1h derives the minute unit from the computed preset range.
    expect(input.unit).toBe('minute')
  })
})
