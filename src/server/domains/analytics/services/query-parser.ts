/* oxlint-disable typescript/no-unsafe-type-assertion */
import {
  FILTERABLE_TYPES,
  PRESET_KEYS,
  computeDateRange,
  type DateRange,
  type Filters,
  type MetricType,
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

function isPresetKey(value: string): value is PresetKey {
  return (PRESET_KEYS as readonly string[]).includes(value)
}

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
  } else if (preset && isPresetKey(preset)) {
    range = computeDateRange(preset)
  } else {
    range = computeDateRange('last-7d')
  }

  const filters: Filters = {}
  const MAX_FILTERS_PAYLOAD_BYTES = 10 * 1024

  const filtersRaw = searchParams.get('filters')
  if (filtersRaw && filtersRaw.length <= MAX_FILTERS_PAYLOAD_BYTES) {
    try {
      const parsed: unknown = JSON.parse(filtersRaw)
      if (typeof parsed === 'object' && parsed !== null) {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'string' && value.length > 0 && FILTERABLE_SET.has(key)) {
            // FILTERABLE_SET is built from FILTERABLE_TYPES, so key is a valid MetricType.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            filters[key as MetricType] = value
          }
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
