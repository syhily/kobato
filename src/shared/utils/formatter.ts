// Site-zone date primitives on date-fns + @date-fns/tz: `TZDate` carries the
// runtime settings time zone. Display formatting (relative buckets, numbers,
// byte sizes, durations) lives in `@/shared/i18n/format`; this module keeps
// `formatShowDate` and the primitives below.

import { TZDate } from '@date-fns/tz'
import { format as formatZonedDate } from 'date-fns'

import type { SiteDateParts } from '@/shared/i18n/format'

import { dateFnsLocaleFor, formatRecentDate, siteDateParts } from '@/shared/i18n/format'
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
export function localDateParts(source: Date, locale: string, timeZone: string): SiteDateParts {
  void locale // Kept for signature stability; zone math is locale-independent.
  return siteDateParts(source, timeZone)
}

/**
 * Compatibility wrapper for the post-list/user-table date column. The relative
 * bucket policy lives in `formatRecentDate`; only the configured-pattern
 * fallback is site-local. Pass `now` as an ISO string from the route loader so
 * SSR and hydration agree.
 */
export function formatShowDate(date: Date, config: FormatterLocale, now?: Date | string): string {
  const { locale, timeZone } = pickLocale(config)
  const relative = formatRecentDate(date, { locale: normalizeAppLocale(locale), timeZone, now })
  return relative ?? formatLocalDate(date, undefined, config)
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
  // User-supplied settings pattern: only the nine documented tokens are
  // substituted, and only inside maximal ASCII letter runs — it never reaches
  // date-fns, so every other character renders verbatim. One canonical pattern
  // computes all nine values (only the dayPeriod needs the locale).
  const canonical = formatZonedDate(zoned, 'yyyy MM dd HH hh mm ss a', { locale: dateFnsLocaleFor(locale) })
  const [year, month, day, hour24, hour12, minute, second, dayPeriod] = canonical.split(' ')
  const values = {
    yyyy: year!,
    LL: month!,
    MM: month!,
    dd: day!,
    HH: hour24!,
    hh: hour12!,
    mm: minute!,
    ss: second!,
    a: dayPeriod!,
  } satisfies Record<DateToken, string>
  return pattern.replace(ASCII_LETTER_RUN, (run) => formatLetterRun(run, values))
}

type DateToken = 'yyyy' | 'LL' | 'MM' | 'dd' | 'HH' | 'hh' | 'mm' | 'ss' | 'a'

type MultiCharacterToken = Exclude<DateToken, 'a'>

// Longest first (`yyyy` before the two-letter tokens). The two-letter tokens
// all have distinct first letters, so at most one can match at a position.
const MULTI_CHARACTER_TOKENS = [
  'yyyy',
  'LL',
  'MM',
  'dd',
  'HH',
  'hh',
  'mm',
  'ss',
] as const satisfies readonly MultiCharacterToken[]

function matchTokenAt(run: string, index: number): MultiCharacterToken | undefined {
  return MULTI_CHARACTER_TOKENS.find((token) => run.startsWith(token, index))
}

// Substitution inside one maximal `[A-Za-z]+` run: `a` is a token only when the
// whole run is `a`, other tokens match longest-first, a non-token run stays a
// literal word; after a token, unmatched characters are emitted verbatim and
// scanning continues (`ddTHH` → day + `T` + hour).
function formatLetterRun(run: string, values: Record<DateToken, string>): string {
  if (run === 'a') {
    return values.a
  }
  let output = ''
  let matchedToken = false
  let index = 0
  while (index < run.length) {
    const token = matchTokenAt(run, index)
    if (token === undefined) {
      if (!matchedToken) {
        return run
      }
      output += run[index]
      index += 1
      continue
    }
    output += values[token]
    matchedToken = true
    index += token.length
  }
  return output
}

const ASCII_LETTER_RUN = /[A-Za-z]+/g

// Construction reads locale data, so it is cached per immutable
// (locale, timeZone) pair rather than rebuilt for every list row; FIFO-evict
// bounded like the other process-level Intl caches.
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
