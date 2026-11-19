import type { AdminPostDto } from '@kobato/contracts/posts.ts'

import { safeBoolean } from '@kobato/contracts/primitives.ts'
import { z } from 'zod'

export const PRESET_KEYS = ['last-1h', 'today', 'yesterday', 'last-7d', 'last-30d', 'last-90d', 'last-365d'] as const

export type PresetKey = (typeof PRESET_KEYS)[number]

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

export const METRIC_TYPE_VALUES = [...METRIC_TYPES] as [MetricType, ...MetricType[]]

export const METRIC_GROUPS = ['location', 'referer', 'time', 'device', 'browser'] as const
export type MetricGroup = (typeof METRIC_GROUPS)[number]

export const METRIC_GROUP_TABS: Record<MetricGroup, MetricType[]> = {
  location: ['country', 'region', 'city'],
  referer: ['referer', 'path'],
  time: ['language', 'timezone'],
  device: ['device', 'deviceType', 'screen', 'viewport', 'dpr', 'touch', 'colorScheme', 'netEffectiveType'],
  browser: ['os', 'browser', 'browserType'],
}

export type Filters = Partial<Record<MetricType, string>>

export function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

const dimensionFilter = z
  .string()
  .max(1024)
  .refine((value) => !hasControlChars(value), { message: 'Analytics filters must not contain control characters' })
  .optional()

export const analyticsQuerySchema = z.object({
  preset: z.enum(PRESET_KEY_VALUES).optional(),
  startAt: z.coerce.number().int().nonnegative().optional(),
  endAt: z.coerce.number().int().nonnegative().optional(),
  entityType: z.enum(['post', 'page']).optional(),
  entityId: z.coerce.number().int().positive().optional(),
  country: dimensionFilter,
  region: dimensionFilter,
  city: dimensionFilter,
  referer: dimensionFilter,
  language: dimensionFilter,
  timezone: dimensionFilter,
  os: dimensionFilter,
  browser: dimensionFilter,
  browserType: dimensionFilter,
  device: dimensionFilter,
  deviceType: dimensionFilter,
  screen: dimensionFilter,
  viewport: dimensionFilter,
  dpr: dimensionFilter,
  touch: dimensionFilter,
  colorScheme: dimensionFilter,
  netEffectiveType: dimensionFilter,
  path: dimensionFilter,
  unit: z.enum(TIME_UNITS).optional(),
  clientTimezone: z
    .string()
    .regex(/^[\w+-]+(?:\/[\w+-]+)*$/)
    .max(64)
    .default('Etc/UTC'),
  limit: z.coerce.number().int().min(1).max(500).default(500),
  includeUnknown: safeBoolean().optional(),
})

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>

export interface ResolvedAnalyticsQuery extends Partial<AnalyticsQuery> {
  range: DateRange
}

export const countersDto = z.object({
  visits: z.number().int().nonnegative(),
  visitors: z.number().int().nonnegative(),
  referers: z.number().int().nonnegative(),
})
export type CountersDto = z.infer<typeof countersDto>

export const viewsPointDto = z.object({
  time: z.string(),
  visits: z.number().int().nonnegative(),
  visitors: z.number().int().nonnegative(),
})
export type ViewsPoint = z.infer<typeof viewsPointDto>

export const viewsDto = z.object({
  unit: z.enum(TIME_UNITS),
  clientTimezone: z.string(),
  points: z.array(viewsPointDto),
})
export type ViewsDto = z.infer<typeof viewsDto>

export const heatmapCellDto = z.object({
  weekday: z.number().int().min(1).max(7),
  hour: z.number().int().min(0).max(23),
  visits: z.number().int().nonnegative(),
  visitors: z.number().int().nonnegative(),
})
export type HeatmapCell = z.infer<typeof heatmapCellDto>

export const metricRowDto = z.object({
  name: z.string(),
  visits: z.number().int().nonnegative(),
  visitors: z.number().int().nonnegative(),
})
export type MetricRow = z.infer<typeof metricRowDto>

export const analyticsMetricsInputSchema = analyticsQuerySchema.extend({
  type: z.enum(METRIC_TYPE_VALUES),
  limit: z.coerce.number().int().min(1).max(500).default(20),
})
export type AnalyticsMetricsInput = z.infer<typeof analyticsMetricsInputSchema>

export const analyticsMetricsOutputSchema = z.array(metricRowDto)
export const analyticsHeatmapOutputSchema = z.array(heatmapCellDto)

export const analyticsExportOutputSchema = z.string()

export interface AnalyticsOverviewData {
  counters: CountersDto
  initialMetrics: Partial<Record<MetricType, MetricRow[]>>
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

const pixelDimension = z.number().int().min(0).max(32768).optional()

const deviceEnvStaticFields = {
  screenW: pixelDimension,
  screenH: pixelDimension,
  availW: pixelDimension,
  availH: pixelDimension,
  colorDepth: z.number().int().min(0).max(64).optional(),
  touchPoints: z.number().int().min(0).max(64).optional(),
  pointer: z.enum(['coarse', 'fine']).optional(),
  hover: z.enum(['hover', 'none']).optional(),
  locale: z.string().max(64).optional(),
  timezone: z.string().max(64).optional(),
  hardwareConcurrency: z.number().int().min(0).max(1024).optional(),
  deviceMemory: z.number().min(0).max(1024).optional(),
}

const deviceEnvDynamicFields = {
  viewportW: pixelDimension,
  viewportH: pixelDimension,
  dpr: z.number().min(0).max(10).optional(),
  colorScheme: z.enum(['dark', 'light']).optional(),
  reducedMotion: z.boolean().optional(),
  netEffectiveType: z.enum(['slow-2g', '2g', '3g', '4g']).optional(),
  netDownlink: z.number().min(0).max(10000).optional(),
  netRtt: z.number().int().min(0).max(60000).optional(),
  netSaveData: z.boolean().optional(),
}

export const deviceEnvBeaconSchema = z.object({
  eventId: z.uuid(),
  hasStatic: z.boolean(),
  ...deviceEnvStaticFields,
  ...deviceEnvDynamicFields,
})

export type DeviceEnvBeacon = z.infer<typeof deviceEnvBeaconSchema>

export const adminAnalyticsSearchInputSchema = z.object({
  search: z.string().max(16_384),
})
export type AdminAnalyticsSearchInput = z.infer<typeof adminAnalyticsSearchInputSchema>

export const adminAnalyticsOverviewOutputSchema = z.custom<AnalyticsOverviewData>()

export const adminAnalyticsMentionsOutputSchema = z.object({
  referers: z.custom<MetricRow[]>(),
})

export const adminPostAnalyticsInputSchema = z.object({
  postId: z.number().int().positive(),
  search: z.string().max(16_384),
})
export type AdminPostAnalyticsInput = z.infer<typeof adminPostAnalyticsInputSchema>

export interface AdminPostAnalyticsData extends AnalyticsOverviewData {
  post: AdminPostDto
}
export const adminPostAnalyticsOutputSchema = z.custom<AdminPostAnalyticsData>()
export type AdminPostAnalyticsOutput = z.infer<typeof adminPostAnalyticsOutputSchema>
