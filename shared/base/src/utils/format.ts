import type { AppLocale } from '@kobato/i18n/locales'
import type { Locale as DateFnsLocale } from 'date-fns'

import { TZDate } from '@date-fns/tz'
import { createBoundedMap } from '@kobato/base/utils/memo'
import { enUS, zhCN, zhHK, zhTW } from 'date-fns/locale'

const DATE_FNS_LOCALES = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'zh-HK': zhHK,
  'zh-TW': zhTW,
} as const satisfies Record<AppLocale, DateFnsLocale>

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

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

export interface DateFormatOptions extends Omit<Intl.DateTimeFormatOptions, 'timeZone'> {
  locale: AppLocale
  timeZone: string
}

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

export function formatDate(value: Date | string, options: DateFormatOptions): string {
  const { locale, timeZone, ...rest } = options
  const style = hasComponentOptions(rest) ? {} : { dateStyle: 'short' as const }
  return dateTimeFormatter(locale, { ...style, ...rest, timeZone }).format(toDate(value))
}

export type DateTimeFormatOptions = DateFormatOptions

export function formatDateTime(value: Date | string, options: DateTimeFormatOptions): string {
  const { locale, timeZone, ...rest } = options
  const style = hasComponentOptions(rest) ? {} : { dateStyle: 'short' as const, timeStyle: 'short' as const }
  return dateTimeFormatter(locale, { ...style, ...rest, timeZone }).format(toDate(value))
}

export interface RelativeTimeOptions {
  locale: AppLocale
  timeZone: string
  now?: Date | string
  unit?: Intl.RelativeTimeFormatUnit
}

export interface SiteDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function siteDateParts(value: Date | string, timeZone: string): SiteDateParts {
  const zoned = new TZDate(toDate(value), timeZone)
  if (Number.isNaN(zoned.getTime())) {
    throw new RangeError('Invalid time value')
  }
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
    second: zoned.getSeconds(),
  }
}

function dayNumber(parts: SiteDateParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000)
}

function weekStartDay(parts: SiteDateParts): number {
  const day = dayNumber(parts)
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
  return day - ((weekday + 6) % 7)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function monthsBetween(from: SiteDateParts, to: SiteDateParts): number {
  const months = (to.year - from.year) * 12 + (to.month - from.month)
  if (months === 0) {
    return 0
  }
  if (months > 0) {
    const anchorDay = Math.min(from.day, daysInMonth(to.year, to.month))
    return to.day < anchorDay ? months - 1 : months
  }
  const anchorDay = Math.min(to.day, daysInMonth(from.year, from.month))
  return from.day < anchorDay ? months + 1 : months
}

function displayMonthsBetween(from: SiteDateParts, to: SiteDateParts): number {
  const calendarMonths = (to.year - from.year) * 12 + (to.month - from.month)
  if (calendarMonths === 0) {
    return 0
  }
  return Math.sign(calendarMonths) * Math.max(1, Math.abs(monthsBetween(from, to)))
}

export interface RelativeValueOptions {
  numeric?: 'auto' | 'always'
}

export function formatRelativeValue(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: AppLocale,
  options: RelativeValueOptions = {},
): string {
  return relativeTimeFormatter(locale, { numeric: options.numeric ?? 'always' }).format(value, unit)
}

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

  const targetParts = siteDateParts(target, timeZone)
  const referenceParts = siteDateParts(reference, timeZone)
  const days = dayNumber(referenceParts) - dayNumber(targetParts)
  if (Math.abs(days) < 7) {
    return rtf.format(-days, 'day')
  }
  if (Math.abs(days) < 30) {
    return rtf.format(-Math.floor(days / 7), 'week')
  }
  if (Math.abs(days) < 365) {
    return rtf.format(-displayMonthsBetween(targetParts, referenceParts), 'month')
  }
  return rtf.format(targetParts.year - referenceParts.year, 'year')
}

const RECENT_WINDOW_DAYS = 210

export interface RecentDateOptions {
  locale: AppLocale
  timeZone: string
  now?: Date | string
}

export function formatRecentDate(value: Date | string, options: RecentDateOptions): string | null {
  const { locale, timeZone, now } = options
  const reference = now === undefined ? new Date() : toDate(now)
  const targetParts = siteDateParts(value, timeZone)
  const referenceParts = siteDateParts(reference, timeZone)
  const days = dayNumber(referenceParts) - dayNumber(targetParts)

  if (days === 0) {
    return formatRelativeValue(0, 'day', locale, { numeric: 'auto' })
  }
  if (days < 0) {
    return formatRelativeTime(value, { locale, timeZone, now: reference })
  }
  if (days < 2) {
    return formatRelativeValue(-1, 'day', locale, { numeric: 'auto' })
  }
  if (days < 7) {
    return formatRelativeValue(-days, 'day', locale)
  }
  if (days < 30) {
    const weeks = Math.floor((weekStartDay(referenceParts) - weekStartDay(targetParts)) / 7)
    return formatRelativeValue(-weeks, 'week', locale)
  }
  if (days < RECENT_WINDOW_DAYS) {
    const months = Math.max(1, displayMonthsBetween(targetParts, referenceParts))
    return formatRelativeValue(-months, 'month', locale)
  }
  return null
}

type SingularUnit = 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second'

const SINGULAR_UNITS = {
  year: 'year',
  years: 'year',
  quarter: 'quarter',
  quarters: 'quarter',
  month: 'month',
  months: 'month',
  week: 'week',
  weeks: 'week',
  day: 'day',
  days: 'day',
  hour: 'hour',
  hours: 'hour',
  minute: 'minute',
  minutes: 'minute',
  second: 'second',
  seconds: 'second',
} as const satisfies Record<Intl.RelativeTimeFormatUnit, SingularUnit>

function forcedUnitValue(target: Date, reference: Date, unit: Intl.RelativeTimeFormatUnit, timeZone: string): number {
  const elapsedMs = target.getTime() - reference.getTime()
  const targetParts = siteDateParts(target, timeZone)
  const referenceParts = siteDateParts(reference, timeZone)
  const days = dayNumber(referenceParts) - dayNumber(targetParts)
  switch (SINGULAR_UNITS[unit]) {
    case 'second':
      return Math.round(elapsedMs / 1000)
    case 'minute':
      return Math.round(elapsedMs / 60_000)
    case 'hour':
      return Math.round(elapsedMs / 3_600_000)
    case 'day':
      return -days
    case 'week':
      return -Math.floor(days / 7)
    case 'month':
      return -displayMonthsBetween(targetParts, referenceParts)
    case 'quarter':
      return -Math.round(monthsBetween(targetParts, referenceParts) / 3)
    case 'year':
      return targetParts.year - referenceParts.year
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

export function formatBytes(bytes: number, options: { locale: AppLocale }): string {
  const { locale } = options
  const scaled = BYTE_UNITS.find((entry) => bytes >= entry.threshold) ?? BYTE_UNITS[BYTE_UNITS.length - 1]!
  const isBytes = scaled.unit === 'byte'
  const value = isBytes ? bytes : bytes / scaled.divisor
  return numberFormatter(locale, {
    style: 'unit',
    unit: scaled.unit,
    unitDisplay: isBytes ? 'long' : 'short',
    maximumFractionDigits: isBytes ? 0 : 1,
    minimumFractionDigits: isBytes ? 0 : 1,
  }).format(value)
}

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

export function formatDisplayName(
  type: 'region' | 'language' | 'currency',
  code: string,
  options: DisplayNameOptions,
): string {
  const fallback = options.fallback ?? 'code'
  try {
    const formatter = displayNamesFormatter(options.locale, type, fallback)
    return formatter.of(code) ?? code
  } catch {
    return code
  }
}

export function compareDisplayText(a: string, b: string, locale: AppLocale): number {
  const key = locale
  const cached = collators.get(key)
  const collator = cached ?? new Intl.Collator(locale)
  if (cached === undefined) {
    collators.set(key, collator)
  }
  return collator.compare(a, b)
}
