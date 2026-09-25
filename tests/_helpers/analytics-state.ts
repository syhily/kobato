import type { AnalyticsState } from '@/ui/admin/analytics/use-analytics-state'

// Deterministic AnalyticsState stub for rendering analytics dashboard panels
// outside a route module — the AnalyticsStateProvider needs an explicit
// state object now that panels no longer read useSearchParams themselves.
export function makeAnalyticsState(overrides: Partial<AnalyticsState> = {}): AnalyticsState {
  return {
    preset: null,
    range: { startAt: 1000, endAt: 2000 },
    filters: {},
    viewMode: 'trend',
    heatmapMetric: 'visits',
    setPreset: () => {},
    setRange: () => {},
    setFilter: () => {},
    clearFilter: () => {},
    clearAllFilters: () => {},
    setViewMode: () => {},
    setHeatmapMetric: () => {},
    ...overrides,
  }
}
