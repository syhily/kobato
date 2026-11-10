import type { AnalyticsState } from '@/ui/admin/analytics/use-analytics-state'

// Deterministic AnalyticsState stub for rendering analytics panels outside a route
// module, where the provider needs an explicit state object.
export function makeAnalyticsState(overrides: Partial<AnalyticsState> = {}): AnalyticsState {
  return {
    preset: null,
    range: { startAt: 1000, endAt: 2000 },
    filters: {},
    viewMode: 'trend',
    heatmapMetric: 'visits',
    includeUnknown: false,
    setPreset: () => {},
    setRange: () => {},
    setFilter: () => {},
    clearFilter: () => {},
    clearAllFilters: () => {},
    setViewMode: () => {},
    setHeatmapMetric: () => {},
    setIncludeUnknown: () => {},
    ...overrides,
  }
}
