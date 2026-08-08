// Analytics wire types, time-range primitives, and query helpers.
// Consumed by both the server query builder and the React dashboard.

export const PRESET_KEYS = ['last-1h', 'today', 'yesterday', 'last-7d', 'last-30d', 'last-90d', 'last-365d'] as const

export type PresetKey = (typeof PRESET_KEYS)[number]

// Typed tuple for z.enum (z.enum does not accept readonly arrays).
export const PRESET_KEY_VALUES = [...PRESET_KEYS] as [PresetKey, ...PresetKey[]]

export interface DateRange {
  /** Unix seconds, inclusive. */
  startAt: number
  /** Unix seconds, exclusive. */
  endAt: number
}

const HOUR = 60 * 60
const DAY = 24 * HOUR

function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function computeDateRange(preset: PresetKey, now: Date = new Date()): DateRange {
  const nowSec = Math.floor(now.getTime() / 1000)
  switch (preset) {
    case 'last-1h':
      return { startAt: nowSec - HOUR, endAt: nowSec }
    case 'today': {
      const startOfDay = Math.floor(startOfLocalDay(now).getTime() / 1000)
      return { startAt: startOfDay, endAt: nowSec }
    }
    case 'yesterday': {
      const start = startOfLocalDay(now).getTime() / 1000 - DAY
      const end = start + DAY
      return { startAt: start, endAt: end }
    }
    case 'last-7d':
      return { startAt: nowSec - 7 * DAY, endAt: nowSec }
    case 'last-30d':
      return { startAt: nowSec - 30 * DAY, endAt: nowSec }
    case 'last-90d':
      return { startAt: nowSec - 90 * DAY, endAt: nowSec }
    case 'last-365d':
      return { startAt: nowSec - 365 * DAY, endAt: nowSec }
  }
}

/**
 * Time bucket width in ms for the views time series. The SQL half is
 * `timeBucketInterval` in `domains/analytics/services/duckdb-sql`;
 * an unmapped width fails loudly there.
 */
export function pickTimeBucketMs(range: DateRange): number {
  const span = range.endAt - range.startAt
  if (span <= 2 * HOUR) {
    return 60_000
  }
  if (span <= 12 * HOUR) {
    return 15 * 60_000
  }
  if (span <= 30 * DAY) {
    return 3_600_000
  }
  return 86_400_000
}

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
  'path',
] as const

export type MetricType = (typeof METRIC_TYPES)[number]

export const METRIC_TYPE_VALUES = [...METRIC_TYPES] as [MetricType, ...MetricType[]]

export const METRIC_GROUPS = ['location', 'referer', 'time', 'device', 'browser'] as const
export type MetricGroup = (typeof METRIC_GROUPS)[number]

export const METRIC_GROUP_TABS: Record<MetricGroup, MetricType[]> = {
  location: ['country', 'region', 'city'],
  referer: ['referer', 'path'],
  time: ['language', 'timezone'],
  device: ['device', 'deviceType'],
  browser: ['browser', 'os'],
}

export const FILTERABLE_TYPES = METRIC_TYPES

export type Filters = Partial<Record<MetricType, string>>

export interface AnalyticsQuery {
  preset?: PresetKey
  startAt?: number
  endAt?: number
  filters?: Filters
}

export interface CountersDto {
  visits: number
  visitors: number
  referers: number
}

export interface ViewsPoint {
  /** ISO 8601 timestamp at the start of the bucket. */
  time: string
  visits: number
  visitors: number
}

export interface HeatmapCell {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number
  /** 0–23. */
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
