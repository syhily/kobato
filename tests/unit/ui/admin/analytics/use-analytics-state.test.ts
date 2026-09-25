import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DateRange, PresetKey } from '@/shared/contracts/analytics'

import { renderHook } from '#/_helpers/hook'
import { PRESET_KEYS, computeDateRange } from '@/shared/contracts/analytics'
import { buildAnalyticsInput, useAnalyticsState } from '@/ui/admin/analytics/use-analytics-state'

// Mirrors the mocking pattern in `use-session-sort.test.tsx`:
// `useSearchParams` is stubbed so we can drive the URL the hook reads
// from without bringing up a real router history.

const mock = vi.hoisted(() => ({
  setSearchParams: vi.fn(),
  useSearchParams: vi.fn(),
}))

mock.useSearchParams.mockImplementation(() => [new URLSearchParams(), mock.setSearchParams])

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useSearchParams: mock.useSearchParams,
  }
})

function withParams(init: string | Record<string, string>) {
  mock.useSearchParams.mockReturnValueOnce([new URLSearchParams(init), mock.setSearchParams])
}

function applyUpdater(call = 0, prev: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const [updater] = mock.setSearchParams.mock.calls[call]!
  return updater(prev)
}

describe('ui/admin/analytics/useAnalyticsState', () => {
  beforeEach(() => {
    mock.setSearchParams.mockClear()
    mock.useSearchParams.mockClear()
    mock.useSearchParams.mockImplementation(() => [new URLSearchParams(), mock.setSearchParams])
  })

  it('defaults to no preset, no filters, trend view and visits metric', () => {
    const state = renderHook(() => useAnalyticsState())
    expect(state.preset).toBeNull()
    expect(state.filters).toEqual({})
    expect(state.viewMode).toBe('trend')
    expect(state.heatmapMetric).toBe('visits')
  })

  it('computes a default range from the last-7d preset when no params are set', () => {
    const { range } = renderHook(() => useAnalyticsState())
    const expectedSpan = computeDateRange('last-7d')
    expect(range.endAt - range.startAt).toBe(expectedSpan.endAt - expectedSpan.startAt)
  })

  it('parses a recognised preset param and ignores unknown ones', () => {
    withParams({ preset: 'today' })
    expect(renderHook(() => useAnalyticsState()).preset).toBe('today')
    withParams({ preset: 'bogus' })
    expect(renderHook(() => useAnalyticsState()).preset).toBeNull()
  })

  it('parses explicit startAt/endAt over the preset-derived range', () => {
    withParams({ startAt: '1000', endAt: '2000' })
    expect(renderHook(() => useAnalyticsState()).range).toEqual({ startAt: 1000, endAt: 2000 })
  })

  it('falls back to the preset range when startAt/endAt are invalid', () => {
    withParams({ startAt: '2000', endAt: '1000' })
    const { range } = renderHook(() => useAnalyticsState())
    const expectedSpan = computeDateRange('last-7d')
    expect(range.endAt - range.startAt).toBe(expectedSpan.endAt - expectedSpan.startAt)
  })

  it('parses per-dimension filter params', () => {
    withParams({ country: 'CN', browser: 'Chrome' })
    const { filters } = renderHook(() => useAnalyticsState())
    expect(filters).toEqual({ country: 'CN', browser: 'Chrome' })
  })

  it('ignores the removed legacy filters JSON blob', () => {
    withParams({ filters: JSON.stringify({ country: 'CN' }) })
    const { filters } = renderHook(() => useAnalyticsState())
    expect(filters).toEqual({})
  })

  it('parses the view and metric params', () => {
    withParams({ view: 'heatmap', metric: 'visitors' })
    const state = renderHook(() => useAnalyticsState())
    expect(state.viewMode).toBe('heatmap')
    expect(state.heatmapMetric).toBe('visitors')
  })

  it('ignores unknown view/metric values', () => {
    withParams({ view: 'bogus', metric: 'bogus' })
    const state = renderHook(() => useAnalyticsState())
    expect(state.viewMode).toBe('trend')
    expect(state.heatmapMetric).toBe('visits')
  })

  it('setPreset writes the preset and clears the explicit range', () => {
    const { setPreset } = renderHook(() => useAnalyticsState())
    setPreset('last-30d' as PresetKey)
    expect(mock.setSearchParams).toHaveBeenCalledTimes(1)
    const [, options] = mock.setSearchParams.mock.calls[0]!
    expect(options).toEqual({ replace: true })
    const next = applyUpdater(0, new URLSearchParams({ startAt: '1000', endAt: '2000' }))
    expect(next.get('preset')).toBe('last-30d')
    expect(next.get('startAt')).toBeNull()
    expect(next.get('endAt')).toBeNull()
  })

  it('setRange writes startAt/endAt and clears the preset', () => {
    const { setRange } = renderHook(() => useAnalyticsState())
    const range: DateRange = { startAt: 5, endAt: 99 }
    setRange(range)
    const next = applyUpdater(0, new URLSearchParams({ preset: 'today' }))
    expect(next.get('startAt')).toBe('5')
    expect(next.get('endAt')).toBe('99')
    expect(next.get('preset')).toBeNull()
  })

  it('setFilter writes the per-dimension param and drops the legacy blob', () => {
    // Seed a legacy blob so we can assert the write path deletes it.
    withParams({ filters: JSON.stringify({ country: 'CN' }) })
    const { setFilter } = renderHook(() => useAnalyticsState())
    setFilter('browser', 'Chrome')
    const next = applyUpdater()
    expect(next.get('filters')).toBeNull()
    expect(next.get('browser')).toBe('Chrome')
  })

  it('clearFilter removes a single dimension param and keeps the rest', () => {
    withParams({ country: 'CN', browser: 'Chrome' })
    const { clearFilter } = renderHook(() => useAnalyticsState())
    clearFilter('country')
    const next = applyUpdater(0, new URLSearchParams({ country: 'CN', browser: 'Chrome' }))
    expect(next.get('country')).toBeNull()
    expect(next.get('browser')).toBe('Chrome')
  })

  it('clearAllFilters deletes every dimension param and the legacy blob', () => {
    const { clearAllFilters } = renderHook(() => useAnalyticsState())
    clearAllFilters()
    const next = applyUpdater(0, new URLSearchParams({ country: 'CN', filters: '{"os":"iOS"}', preset: 'today' }))
    expect(next.get('country')).toBeNull()
    expect(next.get('filters')).toBeNull()
    // Unrelated params survive.
    expect(next.get('preset')).toBe('today')
  })

  it('setViewMode writes heatmap and deletes the param for the trend default', () => {
    const { setViewMode } = renderHook(() => useAnalyticsState())
    setViewMode('heatmap')
    expect(applyUpdater(0).get('view')).toBe('heatmap')
    mock.setSearchParams.mockClear()
    const { setViewMode: setAgain } = renderHook(() => useAnalyticsState())
    setAgain('trend')
    expect(applyUpdater(0, new URLSearchParams({ view: 'heatmap' })).get('view')).toBeNull()
  })

  it('setHeatmapMetric writes visitors and deletes the param for the visits default', () => {
    const { setHeatmapMetric } = renderHook(() => useAnalyticsState())
    setHeatmapMetric('visitors')
    expect(applyUpdater(0).get('metric')).toBe('visitors')
    mock.setSearchParams.mockClear()
    const { setHeatmapMetric: setAgain } = renderHook(() => useAnalyticsState())
    setAgain('visits')
    expect(applyUpdater(0, new URLSearchParams({ metric: 'visitors' })).get('metric')).toBeNull()
  })

  it('exposes a stable surface across every PRESET_KEYS preset', () => {
    for (const preset of PRESET_KEYS) {
      withParams({ preset })
      expect(renderHook(() => useAnalyticsState()).preset).toBe(preset)
    }
  })
})

describe('ui/admin/analytics/buildAnalyticsInput', () => {
  const base = {
    preset: null,
    range: { startAt: 1000, endAt: 2000 },
    filters: { country: 'CN' } as const,
  }

  it('expands the URL state into the per-dimension wire fields', () => {
    const input = buildAnalyticsInput(base)
    expect(input.country).toBe('CN')
    expect(input.startAt).toBe(1000)
    expect(input.endAt).toBe(2000)
    expect(input.preset).toBeUndefined()
    // The client timezone is always attached.
    expect(typeof input.clientTimezone).toBe('string')
    expect(input.clientTimezone!.length).toBeGreaterThan(0)
  })

  it('sends the preset instead of the explicit range when a preset is active', () => {
    const input = buildAnalyticsInput({ ...base, preset: 'last-7d' as const })
    expect(input.preset).toBe('last-7d')
    expect(input.startAt).toBeUndefined()
    expect(input.endAt).toBeUndefined()
  })

  it('derives the bucket unit from the range span', () => {
    expect(buildAnalyticsInput({ ...base, range: { startAt: 1000, endAt: 2000 } }).unit).toBe('minute')
    expect(buildAnalyticsInput({ ...base, range: { startAt: 1000, endAt: 1000 + 12 * 3600 } }).unit).toBe('hour')
    expect(buildAnalyticsInput({ ...base, range: { startAt: 1000, endAt: 1000 + 3 * 86400 } }).unit).toBe('day')
  })

  it('attaches the entity scope when provided', () => {
    const input = buildAnalyticsInput(base, { scope: { entityType: 'post', entityId: 7 }, limit: 500 })
    expect(input.entityType).toBe('post')
    expect(input.entityId).toBe(7)
    expect(input.limit).toBe(500)
  })
})
