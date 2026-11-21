import { mockTanstackQuery } from '@kobato/test/mock-react-query'
import { AnalyticsStateProvider } from '@kobato/web-admin/ui/analytics/analytics-state-context'
import { useAnalyticsState } from '@kobato/web-admin/ui/analytics/use-analytics-state'
import { ViewsChart } from '@kobato/web-admin/ui/analytics/ViewsChart'
import { renderInRouter } from '@kobato/web-client/tests/utils/render'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const control = mockTanstackQuery()

const captured = vi.hoisted(() => ({ inputs: [] as Record<string, unknown>[] }))

const orpcQueryMod = await import('@kobato/web-client/api/orpc-query')
vi.spyOn(orpcQueryMod, 'orpcQuery', 'get').mockImplementation((() => ({
  analytics: {
    views: {
      queryOptions: (options: { input: Record<string, unknown> }) => {
        captured.inputs.push(options.input)
        return { queryKey: ['analytics', 'views', options.input] }
      },
    },
  },
})) as never)

afterAll(() => {
  vi.restoreAllMocks()
})

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
    expect(input.unit).toBe('minute')
  })
})
