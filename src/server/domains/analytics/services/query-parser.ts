/* oxlint-disable typescript/no-unsafe-type-assertion */
import {
  FILTERABLE_TYPES,
  PRESET_KEYS,
  computeDateRange,
  type DateRange,
  type Filters,
  type PresetKey,
} from '@/shared/contracts/analytics'
import { idFromString } from '@/shared/utils/id'

export interface AnalyticsQueryInput {
  range: DateRange
  filters: Filters
  entityType?: 'post' | 'page'
  entityId?: bigint
}

const FILTERABLE_SET = new Set<string>(FILTERABLE_TYPES)

export function parseAnalyticsSearch(searchParams: URLSearchParams): AnalyticsQueryInput {
  const preset = searchParams.get('preset')
  const startAtRaw = searchParams.get('startAt')
  const endAtRaw = searchParams.get('endAt')

  let range: DateRange
  if (startAtRaw && endAtRaw) {
    const startAt = Number.parseInt(startAtRaw, 10)
    const endAt = Number.parseInt(endAtRaw, 10)
    if (Number.isFinite(startAt) && Number.isFinite(endAt) && endAt > startAt) {
      range = { startAt, endAt }
    } else {
      range = computeDateRange('last-7d')
    }
  } else if (preset && (PRESET_KEYS as readonly string[]).includes(preset)) {
    range = computeDateRange(preset as PresetKey)
  } else {
    range = computeDateRange('last-7d')
  }

  const filters: Filters = {}
  const MAX_FILTERS_PAYLOAD_BYTES = 10 * 1024

  const filtersRaw = searchParams.get('filters')
  if (filtersRaw && filtersRaw.length <= MAX_FILTERS_PAYLOAD_BYTES) {
    try {
      const parsed = JSON.parse(filtersRaw) as Record<string, unknown>
      for (const [key, value] of Object.entries(parsed)) {
        if (FILTERABLE_SET.has(key) && typeof value === 'string' && value.length > 0) {
          filters[key as import('@/shared/contracts/analytics').MetricType] = value
        }
      }
    } catch {
      // bad JSON → just drop filters
    }
  }

  const entityType = searchParams.get('entityType')
  const entityIdRaw = searchParams.get('entityId')
  const result: AnalyticsQueryInput = { range, filters }
  if ((entityType === 'post' || entityType === 'page') && entityIdRaw) {
    try {
      result.entityType = entityType
      result.entityId = idFromString(entityIdRaw)
    } catch {
      // ignore
    }
  }
  return result
}
