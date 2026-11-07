// Date formatter primitives shared between SSR and the client bundle.
// Built on date-fns + @date-fns/tz: `TZDate` carries the site-configured
// time zone (runtime DB-backed config), so callers thread it in.

import { TZDate } from '@date-fns/tz'
import { format as formatZonedDate } from 'date-fns'

import { dateFnsLocaleFor, formatRelativeValue } from '@/shared/i18n/format'
import { normalizeAppLocale } from '@/shared/i18n/locales'
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

/**
 * Post-list display date: localized relative buckets for the recent past, the
 * configured date pattern beyond them. `now` defaults to the runtime clock;
 * pass an ISO string from the route loader so SSR and hydration agree.
 */
export function formatShowDate(date: Date, config: FormatterLocale, now?: Date | string) {
  const { timeZone } = pickLocale(config)
  const locale = normalizeAppLocale(pickLocale(config).locale)
  const source = localDateParts(date, locale, timeZone)
  const nowInstant = now === undefined ? new Date() : new Date(now)
  const nowParts = localDateParts(nowInstant, locale, timeZone)
  const deltaDays = dayNumber(nowParts) - dayNumber(source)

  if (deltaDays < 1) {
    // `numeric: 'auto'` is what makes 0 days read as 今天/today, -1 as 昨天/yesterday.
    return formatRelativeValue(0, 'day', locale, { numeric: 'auto' })
  } else if (deltaDays < 2) {
    return formatRelativeValue(-1, 'day', locale, { numeric: 'auto' })
  } else if (deltaDays < 7) {
    return formatRelativeValue(-deltaDays, 'day', locale)
  } else if (deltaDays < 30) {
    const weeks = Math.floor((weekStartDay(nowParts) - weekStartDay(source)) / 7)
    return formatRelativeValue(-weeks, 'week', locale)
  } else if (deltaDays < 210) {
    const months = (nowParts.year - source.year) * 12 + nowParts.month - source.month
    return formatRelativeValue(-months, 'month', locale)
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
  // The format string is USER-SUPPLIED (stored in settings): only the nine
  // documented tokens are substituted, so it never reaches date-fns — every
  // other character renders verbatim. One fixed canonical pattern computes all
  // nine values (the dayPeriod needs the locale, everything else does not).
  const canonical = formatZonedDate(zoned, 'yyyy MM dd HH hh mm ss a', { locale: dateFnsLocaleFor(locale) })
  const [year, month, day, hour24, hour12, minute, second, dayPeriod] = canonical.split(' ')
  return pattern.replace(DATE_TOKEN_PATTERN, (token, offset: number) => {
    switch (token) {
      case 'yyyy':
        return year!
      case 'LL':
      case 'MM':
        return month!
      case 'dd':
        return day!
      case 'HH':
        return hour24!
      case 'hh':
        return hour12!
      case 'mm':
        return minute!
      case 'ss':
        return second!
      case 'a': {
        // `a` is a single letter: only a STANDALONE one is a token, so literal
        // words such as `day` in a custom pattern survive verbatim.
        return isAsciiLetter(pattern[offset - 1]) || isAsciiLetter(pattern[offset + 1]) ? token : dayPeriod!
      }
      default:
        return token
    }
  })
}

function isAsciiLetter(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z]/.test(char)
}

// Single pass, multi-character tokens first: a substituted value is never
// re-scanned as another token.
const DATE_TOKEN_PATTERN = /yyyy|LL|MM|dd|HH|hh|mm|ss|a/g

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
