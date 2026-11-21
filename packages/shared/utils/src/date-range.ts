export const PRESET_KEYS = ['last-1h', 'today', 'yesterday', 'last-7d', 'last-30d', 'last-90d', 'last-365d'] as const

export type PresetKey = (typeof PRESET_KEYS)[number]

export interface DateRange {
  startAt: number
  endAt: number
}

const HOUR = 60 * 60
const DAY = 24 * HOUR

function startOfLocalDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

export function computeDateRange(preset: PresetKey, now: Date = new Date()): DateRange {
  const nowSec = Math.floor(now.getTime() / 1000)
  switch (preset) {
    case 'last-1h':
      return { startAt: nowSec - HOUR, endAt: nowSec }
    case 'today': {
      const startAt = Math.floor(startOfLocalDay(now).getTime() / 1000)
      return { startAt, endAt: nowSec }
    }
    case 'yesterday': {
      const startAt = Math.floor(startOfLocalDay(now).getTime() / 1000) - DAY
      return { startAt, endAt: startAt + DAY }
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
