export const PRESET_KEYS = ['last-1h', 'today', 'yesterday', 'last-7d', 'last-30d', 'last-90d', 'last-365d'] as const

export type PresetKey = (typeof PRESET_KEYS)[number]

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

export const TIME_UNITS = ['minute', 'hour', 'day'] as const
export type TimeUnit = (typeof TIME_UNITS)[number]

export function pickTimeUnit(range: DateRange): TimeUnit {
  const span = range.endAt - range.startAt
  if (span <= HOUR) {
    return 'minute'
  }
  if (span <= DAY) {
    return 'hour'
  }
  return 'day'
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
