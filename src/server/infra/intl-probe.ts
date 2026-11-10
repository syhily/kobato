// SEA Intl capability probe. Technical server probe: it
// verifies that the ICU data bundled into the executable actually renders the
// four UI locales — not merely that the Intl constructors exist.
//
// Pure module on purpose: it imports only the locale contract and the shared
// display formatter (no config, no database, no server graph), so
// `kobato --smoke-intl` can run with zero side effects and
// `scripts/sea/smoke.ts` can spawn it on a bare binary. The probe never reads
// ICU data files: every assertion goes through the public Intl APIs, so the
// same module works against a full-ICU or a small-ICU SEA target and fails
// loudly (rather than degrading to English) when the data is missing.

import type { AppLocale } from '@/shared/i18n/locales'

import { formatDuration } from '@/shared/i18n/format'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

/** Fixed instant so the expected strings never depend on the wall clock. */
export const INTL_PROBE_INSTANT = new Date('2026-01-02T15:04:05.000Z')

/** `formatDuration` input: 2 minutes 5 seconds — exercises units + ListFormat. */
export const INTL_PROBE_DURATION_MS = 125_000

/** Plain unit labels for the standalone Intl.ListFormat assertion. */
export const INTL_LIST_PROBE = ['1 hour', '30 minutes'] as const

/**
 * Collation probe: the same three glyphs sort into different orders per
 * locale (root/en-US code-point order, zh-CN pinyin, zh-Hant stroke), so the
 * pinned output catches a runtime that silently resolves the root collator.
 */
export const INTL_COLLATION_PROBE = ['張', '李', '王'] as const

export interface IntlLocaleExpectation {
  /** Numeric date + h23 time in UTC (CLDR field order varies per locale). */
  dateTime: string
  /** `RelativeTimeFormat.format(-1, 'day')` with numeric:'auto'. */
  relativeDay: string
  /** `DisplayNames({ type: 'region' }).of('US')`. */
  regionName: string
  /** `PluralRules.select(1)` — the CLDR plural category. */
  pluralCategory: string
  /** `Intl.ListFormat({ style: 'narrow', type: 'unit' })` over {@link INTL_LIST_PROBE}. */
  listUnits: string
  /** `formatDuration(INTL_PROBE_DURATION_MS)` — the production duration surface. */
  duration: string
  /** `Intl.Collator` sort of {@link INTL_COLLATION_PROBE}, comma-joined. */
  collation: string
}

/**
 * Exact expected outputs per locale. These are asserted, not snapshotted: a
 * binary whose ICU data is missing/reduced fails the probe instead of silently
 * falling back to English. The values are CLDR-stable for the pinned Node/ICU
 * (the SEA build's Node version is fixed by `.nvmrc`).
 */
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
  // ICU may emit narrow no-break spaces (U+202F) before day-period markers —
  // `\s` folds them so the comparison is about the pattern, not the glyph.
  return text.replace(/\s+/g, ' ').trim()
}

// `Intl.supportedLocalesOf` is constructor-scoped (there is no namespace-level
// one): every constructor we use must actually resolve the locale, otherwise
// the runtime would silently fall back to the default locale.
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
  // One closure per constructor keeps each static signature concrete — the
  // heterogeneous constructor union is not callable as a single function.
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

/** Run every surface for one locale and compare with the expected output. */
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
    // The REAL duration surface, not a re-implementation: units come from
    // NumberFormat and the joiner from ListFormat.
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

/**
 * Produce one readable line per locale plus a success line. Injected writer
 * keeps the unit test free of stdout capture; the SEA CLI passes the default.
 */
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
