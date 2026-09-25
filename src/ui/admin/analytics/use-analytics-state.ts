import type { z } from 'zod'

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import type { DateRange, Filters, MetricType, PresetKey, TimeUnit } from '@/shared/contracts/analytics'

import {
  METRIC_TYPES,
  PRESET_KEYS,
  analyticsQuerySchema,
  computeDateRange,
  pickTimeUnit,
} from '@/shared/contracts/analytics'

// URL-synced dashboard state modeled on Slite's `dashboard-query.ts`:
// preset/startAt/endAt plus per-dimension filter params, the trend|heatmap
// view switch, and the heatmap metric. Writes still delete the legacy
// `filters` JSON param so old links get cleaned up on the first change.

export type AnalyticsViewMode = 'trend' | 'heatmap'
export type HeatmapMetric = 'visits' | 'visitors'

export interface AnalyticsScope {
  entityType?: 'post' | 'page'
  /** Numeric domain id — the wire schema's coerced representation; string
   *  route/DTO ids convert once at the boundary (`idFromString`). */
  entityId?: number
}

export interface AnalyticsState {
  preset: PresetKey | null
  range: DateRange
  filters: Filters
  viewMode: AnalyticsViewMode
  heatmapMetric: HeatmapMetric
  setPreset: (preset: PresetKey) => void
  setRange: (range: DateRange) => void
  setFilter: (type: MetricType, value: string) => void
  clearFilter: (type: MetricType) => void
  clearAllFilters: () => void
  setViewMode: (view: AnalyticsViewMode) => void
  setHeatmapMetric: (metric: HeatmapMetric) => void
}

export function useAnalyticsState(): AnalyticsState {
  const [params, setParams] = useSearchParams()

  const preset = useMemo<PresetKey | null>(() => {
    const raw = params.get('preset')
    return PRESET_KEYS.find((key) => key === raw) ?? null
  }, [params])

  const startAt = params.get('startAt')
  const endAt = params.get('endAt')

  const range = useMemo<DateRange>(() => {
    if (startAt && endAt) {
      const s = Number.parseInt(startAt, 10)
      const e = Number.parseInt(endAt, 10)
      if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
        return { startAt: s, endAt: e }
      }
    }
    return computeDateRange(preset ?? 'last-7d')
  }, [startAt, endAt, preset])

  const filters = useMemo<Filters>(() => {
    const out: Filters = {}
    for (const type of METRIC_TYPES) {
      const value = params.get(type)
      if (value) {
        out[type] = value
      }
    }
    return out
  }, [params])

  const viewMode: AnalyticsViewMode = params.get('view') === 'heatmap' ? 'heatmap' : 'trend'
  const heatmapMetric: HeatmapMetric = params.get('metric') === 'visitors' ? 'visitors' : 'visits'

  const setPreset = useCallback(
    (p: PresetKey) => {
      setParams(
        (prev) => {
          prev.set('preset', p)
          prev.delete('startAt')
          prev.delete('endAt')
          return prev
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setRange = useCallback(
    (r: DateRange) => {
      setParams(
        (prev) => {
          prev.set('startAt', String(r.startAt))
          prev.set('endAt', String(r.endAt))
          prev.delete('preset')
          return prev
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const writeFilters = useCallback(
    (next: Filters) => {
      setParams(
        (prev) => {
          for (const type of METRIC_TYPES) {
            prev.delete(type)
          }
          prev.delete('filters')
          for (const type of METRIC_TYPES) {
            const value = next[type]
            if (value) {
              prev.set(type, value)
            }
          }
          return prev
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setFilter = useCallback(
    (type: MetricType, value: string) => {
      writeFilters({ ...filters, [type]: value })
    },
    [filters, writeFilters],
  )

  const clearFilter = useCallback(
    (type: MetricType) => {
      const next = { ...filters }
      delete next[type]
      writeFilters(next)
    },
    [filters, writeFilters],
  )

  const clearAllFilters = useCallback(() => writeFilters({}), [writeFilters])

  const setViewMode = useCallback(
    (view: AnalyticsViewMode) => {
      setParams(
        (prev) => {
          if (view === 'trend') {
            prev.delete('view')
          } else {
            prev.set('view', view)
          }
          return prev
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setHeatmapMetric = useCallback(
    (metric: HeatmapMetric) => {
      setParams(
        (prev) => {
          if (metric === 'visits') {
            prev.delete('metric')
          } else {
            prev.set('metric', metric)
          }
          return prev
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return useMemo(
    () => ({
      preset,
      range,
      filters,
      viewMode,
      heatmapMetric,
      setPreset,
      setRange,
      setFilter,
      clearFilter,
      clearAllFilters,
      setViewMode,
      setHeatmapMetric,
    }),
    [
      preset,
      range,
      filters,
      viewMode,
      heatmapMetric,
      setPreset,
      setRange,
      setFilter,
      clearFilter,
      clearAllFilters,
      setViewMode,
      setHeatmapMetric,
    ],
  )
}

/** IANA zone sent as `clientTimezone`; falls back to Etc/UTC when Intl is unavailable. */
export function getClientTimezone(): string {
  if (typeof Intl === 'undefined') {
    return 'Etc/UTC'
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC'
}

/** Wire input shape of every analytics procedure (zod input side — coerced
 *  numeric fields accept numbers or numeric strings). */
export type AnalyticsQueryInput = z.input<typeof analyticsQuerySchema>

/**
 * Flat oRPC input for the analytics procedures: the URL state expanded into
 * the per-dimension wire fields plus client-side derivations the server
 * cannot know (`unit` from the resolved range, `clientTimezone` from Intl).
 */
export function buildAnalyticsInput(
  state: Pick<AnalyticsState, 'preset' | 'range' | 'filters'>,
  options: { scope?: AnalyticsScope; unit?: TimeUnit; limit?: number } = {},
): AnalyticsQueryInput {
  return {
    preset: state.preset ?? undefined,
    startAt: state.preset ? undefined : state.range.startAt,
    endAt: state.preset ? undefined : state.range.endAt,
    ...state.filters,
    entityType: options.scope?.entityType,
    entityId: options.scope?.entityId,
    clientTimezone: getClientTimezone(),
    unit: options.unit ?? pickTimeUnit(state.range),
    limit: options.limit,
  }
}
