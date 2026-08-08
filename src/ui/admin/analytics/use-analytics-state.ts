import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import type { DateRange, Filters, MetricType, PresetKey } from '@/shared/contracts/analytics'

import { PRESET_KEYS, computeDateRange } from '@/shared/contracts/analytics'

function isMetricType(key: string): key is MetricType {
  return (
    key === 'country' ||
    key === 'region' ||
    key === 'city' ||
    key === 'referer' ||
    key === 'language' ||
    key === 'timezone' ||
    key === 'os' ||
    key === 'browser' ||
    key === 'browserType' ||
    key === 'device' ||
    key === 'deviceType' ||
    key === 'path'
  )
}

// URL-synced dashboard state; setters trigger the loader's revalidation pass.

export interface AnalyticsState {
  preset: PresetKey | null
  range: DateRange
  filters: Filters
  setPreset: (preset: PresetKey) => void
  setRange: (range: DateRange) => void
  setFilter: (type: MetricType, value: string) => void
  clearFilter: (type: MetricType) => void
  clearAllFilters: () => void
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
    const raw = params.get('filters')
    if (!raw) {
      return {}
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) {
        return {}
      }
      const out: Filters = {}
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && value.length > 0 && isMetricType(key)) {
          out[key] = value
        }
      }
      return out
    } catch {
      return {}
    }
  }, [params])

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
          if (Object.keys(next).length === 0) {
            prev.delete('filters')
          } else {
            prev.set('filters', JSON.stringify(next))
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

  return useMemo(
    () => ({ preset, range, filters, setPreset, setRange, setFilter, clearFilter, clearAllFilters }),
    [preset, range, filters, setPreset, setRange, setFilter, clearFilter, clearAllFilters],
  )
}
