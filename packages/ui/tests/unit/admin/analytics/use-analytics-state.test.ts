import type { DateRange, Filters, MetricType, PresetKey } from '@kobato/shared/contracts/analytics'

import { renderHook } from '#/_helpers/hook'

import { PRESET_KEYS, computeDateRange } from '@kobato/shared/contracts/analytics'
import { useAnalyticsState } from '@kobato/ui/admin/analytics/use-analytics-state'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('ui/admin/analytics/useAnalyticsState', () => {
  beforeEach(() => {
    mock.setSearchParams.mockClear()
    mock.useSearchParams.mockClear()
    mock.useSearchParams.mockImplementation(() => [new URLSearchParams(), mock.setSearchParams])
  })

  it('defaults to the last-7d preset and no filters', () => {
    const { preset, filters } = renderHook(() => useAnalyticsState())
    expect(preset).toBeNull()
    expect(filters).toEqual({})
  })

  it('computes a default range from the last-7d preset when no params are set', () => {
    const { range } = renderHook(() => useAnalyticsState())
    // No explicit startAt/endAt → range falls back to computeDateRange
    // with the default preset ('last-7d' is the fallback inside the
    // hook when preset is null).
    const expectedSpan = computeDateRange('last-7d')
    expect(range.endAt - range.startAt).toBe(expectedSpan.endAt - expectedSpan.startAt)
  })

  it('parses a recognised preset param', () => {
    mock.useSearchParams.mockReturnValueOnce([new URLSearchParams({ preset: 'today' }), mock.setSearchParams])
    const { preset } = renderHook(() => useAnalyticsState())
    expect(preset).toBe('today')
  })

  it('ignores an unknown preset value', () => {
    mock.useSearchParams.mockReturnValueOnce([new URLSearchParams({ preset: 'bogus' }), mock.setSearchParams])
    const { preset } = renderHook(() => useAnalyticsState())
    expect(preset).toBeNull()
  })

  it('parses explicit startAt/endAt over the preset-derived range', () => {
    mock.useSearchParams.mockReturnValueOnce([
      new URLSearchParams({ startAt: '1000', endAt: '2000' }),
      mock.setSearchParams,
    ])
    const { range } = renderHook(() => useAnalyticsState())
    expect(range).toEqual({ startAt: 1000, endAt: 2000 })
  })

  it('falls back to the preset range when startAt/endAt are invalid', () => {
    // endAt must be strictly greater than startAt; otherwise the hook
    // discards the pair and recomputes from the preset.
    mock.useSearchParams.mockReturnValueOnce([
      new URLSearchParams({ startAt: '2000', endAt: '1000' }),
      mock.setSearchParams,
    ])
    const { range } = renderHook(() => useAnalyticsState())
    const expectedSpan = computeDateRange('last-7d')
    expect(range.endAt - range.startAt).toBe(expectedSpan.endAt - expectedSpan.startAt)
  })

  it('parses a JSON filters param with known metric types', () => {
    const filters: Filters = { country: 'China', browser: 'Chrome' }
    mock.useSearchParams.mockReturnValueOnce([
      new URLSearchParams({ filters: JSON.stringify(filters) }),
      mock.setSearchParams,
    ])
    const result = renderHook(() => useAnalyticsState())
    expect(result.filters).toEqual(filters)
  })

  it('drops filter entries with unknown metric types', () => {
    mock.useSearchParams.mockReturnValueOnce([
      new URLSearchParams({ filters: JSON.stringify({ bogus: 'x', country: 'China' }) }),
      mock.setSearchParams,
    ])
    const { filters } = renderHook(() => useAnalyticsState())
    expect(filters).toEqual({ country: 'China' })
  })

  it('drops filter entries with empty values', () => {
    mock.useSearchParams.mockReturnValueOnce([
      new URLSearchParams({ filters: JSON.stringify({ country: '', browser: 'Chrome' }) }),
      mock.setSearchParams,
    ])
    const { filters } = renderHook(() => useAnalyticsState())
    expect(filters).toEqual({ browser: 'Chrome' })
  })

  it('returns an empty filter map when the filters param is invalid JSON', () => {
    mock.useSearchParams.mockReturnValueOnce([new URLSearchParams({ filters: '{not-json' }), mock.setSearchParams])
    const { filters } = renderHook(() => useAnalyticsState())
    expect(filters).toEqual({})
  })

  it('setPreset writes the preset and clears the explicit range', () => {
    const { setPreset } = renderHook(() => useAnalyticsState())
    setPreset('last-30d' as PresetKey)
    expect(mock.setSearchParams).toHaveBeenCalledTimes(1)
    const [updater, options] = mock.setSearchParams.mock.calls[0]!
    expect(options).toEqual({ replace: true })
    const prev = new URLSearchParams({ startAt: '1000', endAt: '2000' })
    const next = updater(prev)
    expect(next.get('preset')).toBe('last-30d')
    expect(next.get('startAt')).toBeNull()
    expect(next.get('endAt')).toBeNull()
  })

  it('setRange writes startAt/endAt and clears the preset', () => {
    const { setRange } = renderHook(() => useAnalyticsState())
    const range: DateRange = { startAt: 5, endAt: 99 }
    setRange(range)
    const [updater] = mock.setSearchParams.mock.calls[0]!
    const prev = new URLSearchParams({ preset: 'today' })
    const next = updater(prev)
    expect(next.get('startAt')).toBe('5')
    expect(next.get('endAt')).toBe('99')
    expect(next.get('preset')).toBeNull()
  })

  it('setFilter writes a JSON filter map with the new entry merged in', () => {
    // The hook memoises `filters` off the current params; seed an
    // existing filter so we can assert the merge.
    mock.useSearchParams.mockReturnValueOnce([
      new URLSearchParams({ filters: JSON.stringify({ country: 'China' }) }),
      mock.setSearchParams,
    ])
    const { setFilter } = renderHook(() => useAnalyticsState())
    setFilter('browser' as MetricType, 'Chrome')
    const [updater] = mock.setSearchParams.mock.calls[0]!
    const next = updater(new URLSearchParams())
    const parsed: Filters = JSON.parse(next.get('filters')!)
    expect(parsed).toEqual({ country: 'China', browser: 'Chrome' })
  })

  it('clearFilter removes a single entry from the filter map', () => {
    mock.useSearchParams.mockReturnValueOnce([
      new URLSearchParams({ filters: JSON.stringify({ country: 'China', browser: 'Chrome' }) }),
      mock.setSearchParams,
    ])
    const { clearFilter } = renderHook(() => useAnalyticsState())
    clearFilter('country' as MetricType)
    const [updater] = mock.setSearchParams.mock.calls[0]!
    const next = updater(new URLSearchParams())
    const parsed: Filters = JSON.parse(next.get('filters')!)
    expect(parsed).toEqual({ browser: 'Chrome' })
  })

  it('clearAllFilters deletes the filters param entirely', () => {
    const { clearAllFilters } = renderHook(() => useAnalyticsState())
    clearAllFilters()
    const [updater] = mock.setSearchParams.mock.calls[0]!
    const next = updater(new URLSearchParams({ filters: '{"country":"China"}' }))
    expect(next.get('filters')).toBeNull()
  })

  it('setFilter re-serialises the whole map on every call (no partial writes)', () => {
    mock.useSearchParams.mockReturnValueOnce([
      new URLSearchParams({ filters: JSON.stringify({ country: 'China' }) }),
      mock.setSearchParams,
    ])
    const { setFilter } = renderHook(() => useAnalyticsState())
    setFilter('os' as MetricType, 'iOS')
    const [updater] = mock.setSearchParams.mock.calls[0]!
    const next = updater(new URLSearchParams())
    const parsed: Filters = JSON.parse(next.get('filters')!)
    // The previously-present country filter is preserved alongside
    // the new os entry.
    expect(parsed).toEqual({ country: 'China', os: 'iOS' })
  })

  it('exposes a stable surface across every PRESET_KEYS preset', () => {
    // Sanity-check that the hook accepts every documented preset value
    // without tripping the TypeScript-level PresetKey narrowing.
    for (const preset of PRESET_KEYS) {
      mock.useSearchParams.mockReturnValueOnce([new URLSearchParams({ preset }), mock.setSearchParams])
      const result = renderHook(() => useAnalyticsState())
      expect(result.preset).toBe(preset)
    }
  })
})
