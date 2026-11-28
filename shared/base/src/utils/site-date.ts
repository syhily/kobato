import type { SiteDateParts } from '@kobato/base/utils/format'

import { TZDate } from '@date-fns/tz'
import { dateFnsLocaleFor, formatRecentDate, siteDateParts } from '@kobato/base/utils/format'
import { createBoundedMap } from '@kobato/base/utils/memo'
import { normalizeAppLocale } from '@kobato/i18n/locales'
import { format as formatZonedDate } from 'date-fns'

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

function requireValidZonedDate(source: Date, timeZone: string): TZDate {
  const zoned = new TZDate(source, timeZone)
  if (Number.isNaN(zoned.getTime())) {
    throw new RangeError('Invalid time value')
  }
  return zoned
}

export function localDateParts(source: Date, _locale: string, timeZone: string): SiteDateParts {
  return siteDateParts(source, timeZone)
}

export function formatShowDate(date: Date, config: FormatterLocale, now?: Date | string): string {
  const { locale, timeZone } = pickLocale(config)
  const relative = formatRecentDate(date, { locale: normalizeAppLocale(locale), timeZone, now })
  return relative ?? formatLocalDate(date, undefined, config)
}

export function formatLocalDate(source: string | Date, format: string | undefined, config: FormatterLocale): string {
  const { locale, timeZone, timeFormat } = pickLocale(config)
  const zoned = requireValidZonedDate(new Date(source), timeZone)
  const pattern = format ?? timeFormat
  if (pattern === null) {
    return zonedDateFormatter(locale, timeZone).format(zoned)
  }
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
