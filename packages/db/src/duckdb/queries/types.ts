import type { DateRange, PresetKey, TimeUnit } from '@kobato/utils/date-range'

export const METRIC_TYPES = [
  'country',
  'region',
  'city',
  'referer',
  'language',
  'timezone',
  'os',
  'browser',
  'browserType',
  'device',
  'deviceType',
  'screen',
  'viewport',
  'dpr',
  'touch',
  'colorScheme',
  'netEffectiveType',
  'path',
] as const

export type MetricType = (typeof METRIC_TYPES)[number]

export type AnalyticsDimensionFilters = Partial<Record<MetricType, string>>

export interface AnalyticsRangeInput {
  preset?: PresetKey
  startAt?: number
  endAt?: number
}

export interface ResolvedAnalyticsQuery extends AnalyticsDimensionFilters, AnalyticsRangeInput {
  range: DateRange
  entityType?: 'post' | 'page'
  entityId?: number
  unit?: TimeUnit
  clientTimezone?: string
  limit?: number
  includeUnknown?: boolean
}

export interface CountersSummary {
  visits: number
  visitors: number
  referers: number
}

export interface ViewsPoint {
  /** Bucket label in `clientTimezone`: `%Y-%m-%d %H:%M` / `%Y-%m-%d %H` / `%Y-%m-%d` by unit. */
  time: string
  visits: number
  visitors: number
}

export interface ViewsSeries {
  unit: TimeUnit
  clientTimezone: string
  points: ViewsPoint[]
}

export interface HeatmapCell {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number
  /** 0–23, in `clientTimezone`. */
  hour: number
  visits: number
  visitors: number
}

export interface MetricRow {
  name: string
  visits: number
  visitors: number
}

export interface RealtimeEvent {
  ts: string
  path: string
  country: string | null
  city: string | null
  browser: string | null
  os: string | null
  deviceType: string | null
  isBot: boolean
}
