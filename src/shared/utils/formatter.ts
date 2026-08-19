// Date formatter primitives shared between SSR and the client bundle.
// Built on date-fns + @date-fns/tz: `TZDate` carries the site-configured
// time zone (runtime DB-backed config), so callers thread it in.

import { TZDate } from '@date-fns/tz'
import { format as formatZonedDate } from 'date-fns'

export type FormatterLocale =
  | { locale: string; timeZone: string; timeFormat: string }
  | { settings: { locale: string; timeZone: string; timeFormat: string } }

function pickLocale(config: FormatterLocale): {
  locale: string
  timeZone: string
  timeFormat: string
} {
  if ('settings' in config) {
    return config.settings
  }
  return config
}

interface LocalDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

// Invalid input must keep the previous Intl.DateTimeFormat garbage-in
// behavior: a RangeError('Invalid time value'), never NaN-filled output.
function requireValidZonedDate(source: Date, timeZone: string): TZDate {
  const zoned = new TZDate(source, timeZone)
  if (Number.isNaN(zoned.getTime())) {
    throw new RangeError('Invalid time value')
  }
  return zoned
}

// Exported for calendar grouping (archives buckets) that must agree with the
// displayed dates — both derive from the site-configured time zone.
export function localDateParts(source: Date, locale: string, timeZone: string): LocalDateParts {
  void locale // Kept for signature stability; zone math is locale-independent.
  const zoned = requireValidZonedDate(source, timeZone)
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
    second: zoned.getSeconds(),
  }
}

function dayNumber(parts: Pick<LocalDateParts, 'year' | 'month' | 'day'>): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000)
}

function weekStartDay(parts: Pick<LocalDateParts, 'year' | 'month' | 'day'>): number {
  const day = dayNumber(parts)
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
  return day - ((weekday + 6) % 7)
}

/** `now` defaults to the runtime clock; pass an ISO string from the route loader so SSR and hydration agree. */
export function formatShowDate(date: Date, config: FormatterLocale, now?: Date | string) {
  const { locale, timeZone } = pickLocale(config)
  const source = localDateParts(date, locale, timeZone)
  const nowInstant = now === undefined ? new Date() : new Date(now)
  const nowParts = localDateParts(nowInstant, locale, timeZone)
  const deltaDays = dayNumber(nowParts) - dayNumber(source)

  if (deltaDays < 1) {
    return '今天'
  } else if (deltaDays < 2) {
    return '昨天'
  } else if (deltaDays < 7) {
    return `${deltaDays} 天前`
  } else if (deltaDays < 30) {
    return `${Math.floor((weekStartDay(nowParts) - weekStartDay(source)) / 7)} 周前`
  } else if (deltaDays < 210) {
    const months = (nowParts.year - source.year) * 12 + nowParts.month - source.month
    return `${months} 月前`
  }
  return formatLocalDate(date, undefined, config)
}

export function formatLocalDate(source: string | Date, format: string | undefined, config: FormatterLocale): string {
  const { timeZone, timeFormat } = pickLocale(config)
  const zoned = requireValidZonedDate(new Date(source), timeZone)
  // The format string is USER-SUPPLIED (stored in settings): only the six
  // documented tokens are substituted, so it never reaches date-fns — every
  // other character, including letters that are date-fns tokens (`a`, `E`,
  // `p`…), renders verbatim. date-fns computes the six values off one
  // canonical pattern instead.
  const [year, month, day, hour, minute, second] = formatZonedDate(zoned, 'yyyy MM dd HH mm ss').split(' ')
  return (format || timeFormat)
    .replaceAll('yyyy', year)
    .replaceAll('LL', month)
    .replaceAll('MM', month)
    .replaceAll('dd', day)
    .replaceAll('HH', hour)
    .replaceAll('mm', minute)
    .replaceAll('ss', second)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
