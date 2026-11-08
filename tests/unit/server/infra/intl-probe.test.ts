import { describe, expect, it } from 'vitest'

import { INTL_LOCALE_EXPECTATIONS, INTL_PROBE_INSTANT, probeIntlLocale, runIntlProbe } from '@/server/infra/intl-probe'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// The probe is what `kobato --smoke-intl` runs inside the SEA binary. These
// tests pin the actual ICU output per locale (so a Node/ICU bump that changes
// the bundled data is review-visible) and the four-line success report.

describe('server/infra/intl-probe', () => {
  it('uses a fixed UTC instant', () => {
    expect(INTL_PROBE_INSTANT.toISOString()).toBe('2026-01-02T15:04:05.000Z')
  })

  it.each(SUPPORTED_LOCALES)('renders %s with real ICU data', (locale) => {
    const result = probeIntlLocale(locale)
    expect(result).toEqual({ locale, ...INTL_LOCALE_EXPECTATIONS[locale] })
  })

  it('resolves the locale on every Intl constructor (no silent fallback)', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(Intl.DateTimeFormat.supportedLocalesOf([locale])).toContain(locale)
      expect(Intl.NumberFormat.supportedLocalesOf([locale])).toContain(locale)
      expect(Intl.PluralRules.supportedLocalesOf([locale])).toContain(locale)
      expect(Intl.RelativeTimeFormat.supportedLocalesOf([locale])).toContain(locale)
      expect(Intl.DisplayNames.supportedLocalesOf([locale])).toContain(locale)
    }
  })

  it('distinguishes the locale plural rules (en-US one, Chinese other)', () => {
    expect(probeIntlLocale('en-US').pluralCategory).toBe('one')
    for (const locale of ['zh-CN', 'zh-TW', 'zh-HK'] as const) {
      expect(probeIntlLocale(locale).pluralCategory).toBe('other')
    }
  })

  it('writes one line per locale plus the success line', () => {
    const lines: string[] = []
    runIntlProbe((line) => lines.push(line))

    expect(lines).toHaveLength(SUPPORTED_LOCALES.length + 1)
    for (const locale of SUPPORTED_LOCALES) {
      expect(lines.some((line) => line.includes(locale))).toBe(true)
    }
    expect(lines[lines.length - 1]).toBe(`SEA Intl smoke passed: ${SUPPORTED_LOCALES.join(', ')}\n`)
  })
})
