// SEA Intl capability probe (plan 001, Step 6c). Technical server probe: it
// verifies that the ICU data bundled into the executable actually renders the
// four UI locales — not merely that the Intl constructors exist.
//
// Pure module on purpose: it imports only the locale contract (no config, no
// database, no server graph), so `kobato --smoke-intl` can run with zero
// side effects and `scripts/sea/smoke.ts` can spawn it on a bare binary.

import type { AppLocale } from '@/shared/i18n/locales'

import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

/** Fixed instant so the expected strings never depend on the wall clock. */
export const INTL_PROBE_INSTANT = new Date('2026-01-02T15:04:05.000Z')

export interface IntlLocaleExpectation {
  /** Numeric date + h23 time in UTC (CLDR field order varies per locale). */
  dateTime: string
  /** `RelativeTimeFormat.format(-1, 'day')` with numeric:'auto'. */
  relativeDay: string
  /** `DisplayNames({ type: 'region' }).of('US')`. */
  regionName: string
  /** `PluralRules.select(1)` — the CLDR plural category. */
  pluralCategory: string
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
  },
  'zh-CN': {
    dateTime: '2026/01/02 15:04',
    relativeDay: '昨天',
    regionName: '美国',
    pluralCategory: 'other',
  },
  'zh-TW': {
    dateTime: '2026/01/02 15:04',
    relativeDay: '昨天',
    regionName: '美國',
    pluralCategory: 'other',
  },
  'zh-HK': {
    dateTime: '02/01/2026 15:04',
    relativeDay: '昨日',
    regionName: '美國',
    pluralCategory: 'other',
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
  if (typeof Intl.DisplayNames !== 'function') {
    throw new TypeError('Intl.DisplayNames is unavailable in this runtime (reduced ICU data?)')
  }
  // One closure per constructor keeps each static signature concrete — the
  // heterogeneous constructor union is not callable as a single function.
  const checks: ReadonlyArray<readonly [string, (locales: string[]) => string[]]> = [
    ['DateTimeFormat', (locales) => Intl.DateTimeFormat.supportedLocalesOf(locales)],
    ['NumberFormat', (locales) => Intl.NumberFormat.supportedLocalesOf(locales)],
    ['PluralRules', (locales) => Intl.PluralRules.supportedLocalesOf(locales)],
    ['RelativeTimeFormat', (locales) => Intl.RelativeTimeFormat.supportedLocalesOf(locales)],
    ['DisplayNames', (locales) => Intl.DisplayNames.supportedLocalesOf(locales)],
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
  }

  const expected: IntlLocaleExpectation = INTL_LOCALE_EXPECTATIONS[locale]
  for (const field of ['dateTime', 'relativeDay', 'regionName', 'pluralCategory'] as const) {
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
        `region=${result.regionName} plural(1)=${result.pluralCategory}\n`,
    )
  }
  write(`SEA Intl smoke passed: ${SUPPORTED_LOCALES.join(', ')}\n`)
}
