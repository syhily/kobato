import type { AppLocale } from '@kobato/i18n/locales'

import { SUPPORTED_LOCALES } from '@kobato/i18n/locales'
import { formatDuration } from '@kobato/utils/format'

export const INTL_PROBE_INSTANT = new Date('2026-01-02T15:04:05.000Z')

export const INTL_PROBE_DURATION_MS = 125_000

export const INTL_LIST_PROBE = ['1 hour', '30 minutes'] as const

export const INTL_COLLATION_PROBE = ['張', '李', '王'] as const

export interface IntlLocaleExpectation {
  dateTime: string
  relativeDay: string
  regionName: string
  pluralCategory: string
  listUnits: string
  duration: string
  collation: string
}

export const INTL_LOCALE_EXPECTATIONS = {
  'en-US': {
    dateTime: '01/02/2026, 15:04',
    relativeDay: 'yesterday',
    regionName: 'United States',
    pluralCategory: 'one',
    listUnits: '1 hour 30 minutes',
    duration: '2 minutes 5 seconds',
    collation: '張,李,王',
  },
  'zh-CN': {
    dateTime: '2026/01/02 15:04',
    relativeDay: '昨天',
    regionName: '美国',
    pluralCategory: 'other',
    listUnits: '1 hour30 minutes',
    duration: '2分钟5秒钟',
    collation: '李,王,張',
  },
  'zh-TW': {
    dateTime: '2026/01/02 15:04',
    relativeDay: '昨天',
    regionName: '美國',
    pluralCategory: 'other',
    listUnits: '1 hour30 minutes',
    duration: '2 分鐘5 秒',
    collation: '王,李,張',
  },
  'zh-HK': {
    dateTime: '02/01/2026 15:04',
    relativeDay: '昨日',
    regionName: '美國',
    pluralCategory: 'other',
    listUnits: '1 hour30 minutes',
    duration: '2 分鐘5 秒',
    collation: '王,李,張',
  },
} as const satisfies Record<AppLocale, IntlLocaleExpectation>

export interface IntlLocaleProbeResult extends IntlLocaleExpectation {
  locale: AppLocale
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function assertSupported(locale: AppLocale): void {
  for (const [name, ctor] of [
    ['DateTimeFormat', Intl.DateTimeFormat],
    ['NumberFormat', Intl.NumberFormat],
    ['PluralRules', Intl.PluralRules],
    ['RelativeTimeFormat', Intl.RelativeTimeFormat],
    ['DisplayNames', Intl.DisplayNames],
    ['ListFormat', Intl.ListFormat],
    ['Collator', Intl.Collator],
  ] as const) {
    if (typeof ctor !== 'function') {
      throw new TypeError(`Intl.${name} is unavailable in this runtime (reduced ICU data?)`)
    }
  }
  const checks: ReadonlyArray<readonly [string, (locales: string[]) => string[]]> = [
    ['DateTimeFormat', (locales) => Intl.DateTimeFormat.supportedLocalesOf(locales)],
    ['NumberFormat', (locales) => Intl.NumberFormat.supportedLocalesOf(locales)],
    ['PluralRules', (locales) => Intl.PluralRules.supportedLocalesOf(locales)],
    ['RelativeTimeFormat', (locales) => Intl.RelativeTimeFormat.supportedLocalesOf(locales)],
    ['DisplayNames', (locales) => Intl.DisplayNames.supportedLocalesOf(locales)],
    ['ListFormat', (locales) => Intl.ListFormat.supportedLocalesOf(locales)],
    ['Collator', (locales) => Intl.Collator.supportedLocalesOf(locales)],
  ]
  for (const [name, supportedLocalesOf] of checks) {
    const resolved = supportedLocalesOf([locale])
    if (!resolved.includes(locale)) {
      throw new Error(`Intl.${name}.supportedLocalesOf([${locale}]) resolved ${JSON.stringify(resolved)}`)
    }
  }
}

export function probeIntlLocale(locale: AppLocale): IntlLocaleProbeResult {
  assertSupported(locale)

  const collator = new Intl.Collator(locale)
  const actual: IntlLocaleProbeResult = {
    locale,
    dateTime: normalizeWhitespace(
      new Intl.DateTimeFormat(locale, {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(INTL_PROBE_INSTANT),
    ),
    relativeDay: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day'),
    regionName: new Intl.DisplayNames(locale, { type: 'region' }).of('US') ?? '',
    pluralCategory: new Intl.PluralRules(locale).select(1),
    listUnits: normalizeWhitespace(
      new Intl.ListFormat(locale, { style: 'narrow', type: 'unit' }).format([...INTL_LIST_PROBE]),
    ),
    duration: normalizeWhitespace(formatDuration(INTL_PROBE_DURATION_MS, { locale })),
    collation: [...INTL_COLLATION_PROBE].sort((a, b) => collator.compare(a, b)).join(','),
  }

  const expected: IntlLocaleExpectation = INTL_LOCALE_EXPECTATIONS[locale]
  for (const field of [
    'dateTime',
    'relativeDay',
    'regionName',
    'pluralCategory',
    'listUnits',
    'duration',
    'collation',
  ] as const) {
    if (actual[field] !== expected[field]) {
      throw new Error(
        `${locale} ${field}: got ${JSON.stringify(actual[field])}, expected ${JSON.stringify(expected[field])}`,
      )
    }
  }
  return actual
}

export function runIntlProbe(write: (line: string) => void = (line) => process.stdout.write(line)): void {
  for (const locale of SUPPORTED_LOCALES) {
    const result = probeIntlLocale(locale)
    write(
      `  ${result.locale}: date=${result.dateTime} relative=${result.relativeDay} ` +
        `region=${result.regionName} plural(1)=${result.pluralCategory} ` +
        `duration=${result.duration} collation=${result.collation}\n`,
    )
  }
  write(`SEA Intl smoke passed: ${SUPPORTED_LOCALES.join(', ')}\n`)
}
