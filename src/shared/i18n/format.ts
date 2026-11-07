// The semantic display-formatting facade: the ONE surface UI code uses for
// user-visible dates, numbers, byte sizes, durations and region/language names.
//
// Every function takes an EXPLICIT locale, and every date function an explicit
// site time zone — no runtime-default locale anywhere, so SSR and hydration
// always agree. Formatter instances are cached by immutable keys (locale +
// options, FIFO-evicted) because construction reads locale data.
//
// What must NOT go through here: ISO timestamps, `<input type="datetime-local">`
// values, calendar URL parts, feed/sitemap/API wire formats, analytics bucket
// labels — machine formats stay machine formats.

import type { Locale as DateFnsLocale } from 'date-fns'

import { TZDate } from '@date-fns/tz'
import { enUS, zhCN, zhHK, zhTW } from 'date-fns/locale'

import type { AppLocale } from '@/shared/i18n/locales'

import { createBoundedMap } from '@/shared/utils/memo'

/** All app locales resolve to a date-fns locale for DayPicker / dayPeriod names. */
const DATE_FNS_LOCALES = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'zh-HK': zhHK,
  'zh-TW': zhTW,
} as const satisfies Record<AppLocale, DateFnsLocale>

/** date-fns locale for a UI locale; unknown tags fall back to English. */
export function dateFnsLocaleFor(locale: string): DateFnsLocale {
  return (DATE_FNS_LOCALES as Record<string, DateFnsLocale>)[locale] ?? enUS
}

const FORMATTER_CACHE_CAP = 32
const dateTimeFormatters = createBoundedMap<string, Intl.DateTimeFormat>(FORMATTER_CACHE_CAP)
const numberFormatters = createBoundedMap<string, Intl.NumberFormat>(FORMATTER_CACHE_CAP)
const relativeTimeFormatters = createBoundedMap<string, Intl.RelativeTimeFormat>(FORMATTER_CACHE_CAP)
const listFormatters = createBoundedMap<string, Intl.ListFormat>(FORMATTER_CACHE_CAP)
const displayNamesFormatters = createBoundedMap<string, Intl.DisplayNames>(FORMATTER_CACHE_CAP)
const collators = createBoundedMap<string, Intl.Collator>(FORMATTER_CACHE_CAP)

function cacheKey(locale: string, options: object): string {
  return `${locale}|${JSON.stringify(options)}`
}

function dateTimeFormatter(locale: AppLocale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = cacheKey(locale, options)
  const cached = dateTimeFormatters.get(key)
  if (cached !== undefined) {
    return cached
  }
  const formatter = new Intl.DateTimeFormat(locale, options)
  dateTimeFormatters.set(key, formatter)
  return formatter
}

function numberFormatter(locale: AppLocale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = cacheKey(locale, options)
  const cached = numberFormatters.get(key)
  if (cached !== undefined) {
    return cached
  }
  const formatter = new Intl.NumberFormat(locale, options)
  numberFormatters.set(key, formatter)
  return formatter
}

function relativeTimeFormatter(locale: AppLocale, options: Intl.RelativeTimeFormatOptions): Intl.RelativeTimeFormat {
  const key = cacheKey(locale, options)
  const cached = relativeTimeFormatters.get(key)
  if (cached !== undefined) {
    return cached
  }
  const formatter = new Intl.RelativeTimeFormat(locale, options)
  relativeTimeFormatters.set(key, formatter)
  return formatter
}

function listFormatter(locale: AppLocale, options: Intl.ListFormatOptions): Intl.ListFormat {
  const key = cacheKey(locale, options)
  const cached = listFormatters.get(key)
  if (cached !== undefined) {
    return cached
  }
  const formatter = new Intl.ListFormat(locale, options)
  listFormatters.set(key, formatter)
  return formatter
}

function displayNamesFormatter(
  locale: AppLocale,
  type: Intl.DisplayNamesType,
  fallback: 'code' | 'none',
): Intl.DisplayNames {
  const key = cacheKey(locale, { type, fallback })
  const cached = displayNamesFormatters.get(key)
  if (cached !== undefined) {
    return cached
  }
  const formatter = new Intl.DisplayNames([locale], { type, fallback })
  displayNamesFormatters.set(key, formatter)
  return formatter
}

/** Invalid input keeps Intl's garbage-in behavior: a RangeError, never NaN-filled output. */
function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

export interface DateFormatOptions extends Omit<Intl.DateTimeFormatOptions, 'timeZone'> {
  locale: AppLocale
  /** The SITE time zone (never the visitor's). */
  timeZone: string
}

// `dateStyle` / `timeStyle` are mutually exclusive with component options
// (`year`, `month`, …) in Intl — only apply the shorthand default when the
// caller supplied no explicit parts.
function hasComponentOptions(options: Intl.DateTimeFormatOptions): boolean {
  return [
    'weekday',
    'era',
    'year',
    'month',
    'day',
    'dayPeriod',
    'hour',
    'minute',
    'second',
    'fractionalSecondDigits',
    'timeZoneName',
  ].some((key) => key in options)
}

/** Calendar date in the site time zone, e.g. `2024/3/5` (zh-CN) or `3/5/2024` (en-US). */
export function formatDate(value: Date | string, options: DateFormatOptions): string {
  const { locale, timeZone, ...rest } = options
  const style = hasComponentOptions(rest) ? {} : { dateStyle: 'short' as const }
  return dateTimeFormatter(locale, { ...style, ...rest, timeZone }).format(toDate(value))
}

export type DateTimeFormatOptions = DateFormatOptions

/** Date + time in the site time zone. */
export function formatDateTime(value: Date | string, options: DateTimeFormatOptions): string {
  const { locale, timeZone, ...rest } = options
  const style = hasComponentOptions(rest) ? {} : { dateStyle: 'short' as const, timeStyle: 'short' as const }
  return dateTimeFormatter(locale, { ...style, ...rest, timeZone }).format(toDate(value))
}

export interface RelativeTimeOptions {
  locale: AppLocale
  /** The site time zone used for calendar-day math. */
  timeZone: string
  /** Reference instant; pass the loader's `nowIso` so SSR and hydration agree. */
  now?: Date | string
  /** Force one unit instead of picking the largest applicable one. */
  unit?: Intl.RelativeTimeFormatUnit
}

interface LocalParts {
  year: number
  month: number
  day: number
}

function localParts(date: Date, timeZone: string): LocalParts {
  const zoned = new TZDate(date, timeZone)
  if (Number.isNaN(zoned.getTime())) {
    throw new RangeError('Invalid time value')
  }
  return { year: zoned.getFullYear(), month: zoned.getMonth() + 1, day: zoned.getDate() }
}

function dayNumber(parts: LocalParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000)
}

function monthsBetween(from: LocalParts, to: LocalParts): number {
  return (to.year - from.year) * 12 + (to.month - from.month)
}

export interface RelativeValueOptions {
  /** `auto` renders today/yesterday/last week; `always` renders `0 days ago` / `1 week ago`. */
  numeric?: 'auto' | 'always'
}

/**
 * Format an ALREADY-COMPUTED relative value in one unit (e.g. `-3` + `day`).
 * For callers with their own bucketing policy (post lists keep week-start and
 * month-delta semantics); prefer `formatRelativeTime` otherwise.
 */
export function formatRelativeValue(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: AppLocale,
  options: RelativeValueOptions = {},
): string {
  return relativeTimeFormatter(locale, { numeric: options.numeric ?? 'always' }).format(value, unit)
}

/**
 * Localized relative time (`今天`, `3 天前`, `yesterday`, `3 weeks ago`).
 * Sub-hour deltas read as minutes; everything older is CALENDAR-DAY based in
 * the site time zone (so a value earlier today reads as `today`, not `8 hours
 * ago`) — pass `unit: 'hour'` when hour granularity is wanted.
 */
export function formatRelativeTime(value: Date | string, options: RelativeTimeOptions): string {
  const { locale, timeZone, now, unit } = options
  const target = toDate(value)
  const reference = now === undefined ? new Date() : toDate(now)
  const rtf = relativeTimeFormatter(locale, { numeric: 'auto' })

  if (unit !== undefined) {
    const forced = forcedUnitValue(target, reference, unit, timeZone)
    return rtf.format(forced, unit)
  }

  const elapsedMs = target.getTime() - reference.getTime()
  const absMs = Math.abs(elapsedMs)
  if (absMs < 60_000) {
    return rtf.format(Math.round(elapsedMs / 1000), 'second')
  }
  if (absMs < 3_600_000) {
    return rtf.format(Math.round(elapsedMs / 60_000), 'minute')
  }

  const targetParts = localParts(target, timeZone)
  const referenceParts = localParts(reference, timeZone)
  const days = dayNumber(referenceParts) - dayNumber(targetParts)
  if (Math.abs(days) < 7) {
    return rtf.format(-days, 'day')
  }
  if (Math.abs(days) < 30) {
    return rtf.format(-Math.floor(days / 7), 'week')
  }
  if (Math.abs(days) < 365) {
    return rtf.format(-monthsBetween(targetParts, referenceParts), 'month')
  }
  return rtf.format(targetParts.year - referenceParts.year, 'year')
}

function forcedUnitValue(target: Date, reference: Date, unit: Intl.RelativeTimeFormatUnit, timeZone: string): number {
  const elapsedMs = target.getTime() - reference.getTime()
  switch (unit) {
    case 'second':
      return Math.round(elapsedMs / 1000)
    case 'minute':
      return Math.round(elapsedMs / 60_000)
    case 'hour':
      return Math.round(elapsedMs / 3_600_000)
    case 'day':
      return -(dayNumber(localParts(reference, timeZone)) - dayNumber(localParts(target, timeZone)))
    case 'week':
      return -Math.floor((dayNumber(localParts(reference, timeZone)) - dayNumber(localParts(target, timeZone))) / 7)
    case 'month':
      return -monthsBetween(localParts(target, timeZone), localParts(reference, timeZone))
    case 'year':
      return localParts(target, timeZone).year - localParts(reference, timeZone).year
    // Plural unit spellings (`days`, `months`) and `quarter` fall back to the
    // closest singular/elapsed reading — callers here use the singular names.
    default:
      return Math.round(elapsedMs / 1000)
  }
}

export interface NumberFormatOptions extends Intl.NumberFormatOptions {
  locale: AppLocale
}

export function formatNumber(value: number, options: NumberFormatOptions): string {
  const { locale, ...rest } = options
  return numberFormatter(locale, rest).format(value)
}

type ByteUnit = 'byte' | 'kilobyte' | 'megabyte' | 'gigabyte'

const BYTE_UNITS: readonly { threshold: number; unit: ByteUnit; divisor: number }[] = [
  { threshold: 1024 ** 3, unit: 'gigabyte', divisor: 1024 ** 3 },
  { threshold: 1024 ** 2, unit: 'megabyte', divisor: 1024 ** 2 },
  { threshold: 1024, unit: 'kilobyte', divisor: 1024 },
  { threshold: 0, unit: 'byte', divisor: 1 },
]

/** `1.5 kB` / `1.5 KB`-style byte size (1024-based, one decimal). */
export function formatBytes(bytes: number, options: { locale: AppLocale }): string {
  const { locale } = options
  const scaled = BYTE_UNITS.find((entry) => bytes >= entry.threshold) ?? BYTE_UNITS[BYTE_UNITS.length - 1]!
  const isBytes = scaled.unit === 'byte'
  const value = isBytes ? bytes : bytes / scaled.divisor
  return numberFormatter(locale, {
    style: 'unit',
    unit: scaled.unit,
    // `long` for the bare byte unit ("512 bytes", never "512 byte"); the
    // abbreviated units read naturally short ("1.5 kB").
    unitDisplay: isBytes ? 'long' : 'short',
    // Bytes below 1 KiB are whole; larger units keep one decimal.
    maximumFractionDigits: isBytes ? 0 : 1,
    minimumFractionDigits: isBytes ? 0 : 1,
  }).format(value)
}

/** Compact duration (`1.2 seconds`, `2 minutes 5 seconds`) for status displays. */
export function formatDuration(ms: number, options: { locale: AppLocale }): string {
  const { locale } = options
  if (ms < 1000) {
    return numberFormatter(locale, { style: 'unit', unit: 'millisecond', unitDisplay: 'long' }).format(ms)
  }
  if (ms < 60_000) {
    return numberFormatter(locale, {
      style: 'unit',
      unit: 'second',
      unitDisplay: 'long',
      maximumFractionDigits: 1,
    }).format(ms / 1000)
  }
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  // Staircase truncation: the smaller unit is floored, never rounded — rounding
  // would emit `1 分 60 秒` for 119.5s.
  const seconds = Math.floor((ms % 60_000) / 1000)
  const parts =
    ms >= 3_600_000
      ? [
          numberFormatter(locale, { style: 'unit', unit: 'hour', unitDisplay: 'long' }).format(
            Math.floor(ms / 3_600_000),
          ),
          ...(minutes > 0
            ? [numberFormatter(locale, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(minutes)]
            : []),
        ]
      : [
          numberFormatter(locale, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(
            Math.floor(ms / 60_000),
          ),
          ...(seconds > 0
            ? [numberFormatter(locale, { style: 'unit', unit: 'second', unitDisplay: 'long' }).format(seconds)]
            : []),
        ]
  return listFormatter(locale, { style: 'narrow', type: 'unit' }).format(parts)
}

export interface DisplayNameOptions {
  locale: AppLocale
  fallback?: 'code' | 'none'
}

/** Region (`JP` → 日本) / language (`zh` → 中文) / currency display names. */
export function formatDisplayName(
  type: 'region' | 'language' | 'currency',
  code: string,
  options: DisplayNameOptions,
): string {
  const fallback = options.fallback ?? 'code'
  const formatter = displayNamesFormatter(options.locale, type, fallback)
  try {
    return formatter.of(code) ?? code
  } catch {
    // Malformed codes must not crash a render — show the raw code.
    return code
  }
}

/** User-visible ordering (never for stable machine ordering). */
export function compareDisplayText(a: string, b: string, locale: AppLocale): number {
  const key = locale
  const cached = collators.get(key)
  const collator = cached ?? new Intl.Collator(locale)
  if (cached === undefined) {
    collators.set(key, collator)
  }
  return collator.compare(a, b)
}
