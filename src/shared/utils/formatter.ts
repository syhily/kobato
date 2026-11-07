// Date formatter primitives shared between SSR and the client bundle.
// Built on date-fns + @date-fns/tz: `TZDate` carries the site-configured
// time zone (runtime DB-backed config), so callers thread it in.

import { TZDate } from '@date-fns/tz'
import { format as formatZonedDate } from 'date-fns'

import { createBoundedMap } from '@/shared/utils/memo'

export type FormatterLocale =
  | { locale: string; timeZone: string; timeFormat: string | null }
  | { settings: { locale: string; timeZone: string; timeFormat: string | null } }

function pickLocale(config: FormatterLocale): {
  locale: string
  timeZone: string
  timeFormat: string | null
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
  const { locale, timeZone, timeFormat } = pickLocale(config)
  const zoned = requireValidZonedDate(new Date(source), timeZone)
  const pattern = format ?? timeFormat
  // `null` = follow the locale: the short date + short time Intl default
  // (zh-CN → `2026/11/8 14:30`), still rendering in the site time zone.
  if (pattern === null) {
    return zonedDateFormatter(locale, timeZone).format(zoned)
  }
  // The format string is USER-SUPPLIED (stored in settings): only the seven
  // documented tokens are substituted, so it never reaches date-fns — every
  // other character, including letters that are date-fns tokens (`a`, `E`,
  // `p`…), renders verbatim. date-fns computes the seven values off one
  // canonical pattern instead.
  const [year, month, day, hour, minute, second] = formatZonedDate(zoned, 'yyyy MM dd HH mm ss').split(' ')
  return pattern
    .replaceAll('yyyy', year)
    .replaceAll('LL', month)
    .replaceAll('MM', month)
    .replaceAll('dd', day)
    .replaceAll('HH', hour)
    .replaceAll('mm', minute)
    .replaceAll('ss', second)
}

// Construction reads locale data, so it is cached per immutable
// (locale, timeZone) pair rather than rebuilt for every list row. FIFO-evict
// bounded like the other process-level Intl caches (ADR-0002).
const ZONED_DATE_FORMATTER_CAP = 8
const zonedDateFormatters = createBoundedMap<string, Intl.DateTimeFormat>(ZONED_DATE_FORMATTER_CAP)

function zonedDateFormatter(locale: string, timeZone: string): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}`
  const cached = zonedDateFormatters.get(key)
  if (cached !== undefined) {
    return cached
  }
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone })
  zonedDateFormatters.set(key, formatter)
  return formatter
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

/** Compact duration for admin job/queue displays (`1.2 秒` / `3 分 5 秒`). */
export function formatDurationMs(ms: number): string {
  if (ms < 1000) {
    return `${ms} 毫秒`
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)} 秒`
  }
  // Staircase truncation like formatBytes: the seconds digit is floored, never
  // rounded — rounding would emit `1 分 60 秒` for 119.5s.
  return `${Math.floor(ms / 60_000)} 分 ${Math.floor((ms % 60_000) / 1000)} 秒`
}
