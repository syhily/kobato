import type { AnalyticsState } from '@/ui/analytics/use-analytics-state'

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
