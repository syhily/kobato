import {
  FILTERABLE_TYPES,
  PRESET_KEYS,
  computeDateRange,
  type DateRange,
  type Filters,
  type MetricType,
  type PresetKey,
} from '@kobato/shared/contracts/analytics'
import { idFromString } from '@kobato/shared/utils/id'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

export interface AnalyticsQueryInput {
  range: DateRange
  filters: Filters
  entityType?: 'post' | 'page'
  entityId?: number
}

/**
 * The typed shape every analytics query entry point converges on: the
 * raw string fields before range/filter/entity resolution. Loaders hand
 * in URL search params (`parseAnalyticsSearch` below); the oRPC
 * controller hands in its validated input directly — no URL round-trip.
 */
export interface AnalyticsSearchFields {
  preset?: string | null
  startAt?: string | null
  endAt?: string | null
  filters?: string | null
  entityType?: string | null
  entityId?: string | null
}

const FILTERABLE_SET = new Set<string>(FILTERABLE_TYPES)

function isPresetKey(value: string): value is PresetKey {
  return unsafeCast<readonly string[]>(PRESET_KEYS).includes(value)
}

export function parseAnalyticsInput(fields: AnalyticsSearchFields): AnalyticsQueryInput {
  const preset = fields.preset
  const startAtRaw = fields.startAt
  const endAtRaw = fields.endAt

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

  const filtersRaw = fields.filters
  if (filtersRaw && filtersRaw.length <= MAX_FILTERS_PAYLOAD_BYTES) {
    try {
      const parsed: unknown = JSON.parse(filtersRaw)
      if (typeof parsed === 'object' && parsed !== null) {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'string' && value.length > 0 && FILTERABLE_SET.has(key)) {
            // FILTERABLE_SET is built from FILTERABLE_TYPES, so key is a valid MetricType.
            filters[unsafeCast<MetricType>(key)] = value
          }
        }
      }
    } catch {
      // bad JSON → just drop filters
    }
  }

  const entityType = fields.entityType
  const entityIdRaw = fields.entityId
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

// URL-shaped entry point — only for callers whose input truly is a URL
// (the route loaders). Everything else feeds `parseAnalyticsInput`.
export function parseAnalyticsSearch(searchParams: URLSearchParams): AnalyticsQueryInput {
  return parseAnalyticsInput({
    preset: searchParams.get('preset'),
    startAt: searchParams.get('startAt'),
    endAt: searchParams.get('endAt'),
    filters: searchParams.get('filters'),
    entityType: searchParams.get('entityType'),
    entityId: searchParams.get('entityId'),
  })
}
