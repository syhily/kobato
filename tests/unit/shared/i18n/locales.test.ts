import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LOCALE,
  LOCALE_DISPLAY_NAMES,
  SUPPORTED_LOCALES,
  isKnownLocaleValue,
  isSupportedLocale,
  normalizeAppLocale,
  toOpenGraphLocale,
  type AppLocale,
} from '@/shared/i18n/locales'

describe('shared/i18n/locales', () => {
  it('exposes exactly the four supported UI locales', () => {
    expect([...SUPPORTED_LOCALES]).toEqual(['en-US', 'zh-HK', 'zh-TW', 'zh-CN'])
    expect(DEFAULT_LOCALE).toBe('zh-CN')
  })

  it('canonicalizes every documented alias and leaves canonical tags alone', () => {
    const cases: [string, AppLocale][] = [
      ['en', 'en-US'],
      ['en-US', 'en-US'],
      ['zh', 'zh-CN'],
      ['zh-CN', 'zh-CN'],
      ['zh-Hans-CN', 'zh-CN'],
      ['zh-HK', 'zh-HK'],
      ['zh-Hant-HK', 'zh-HK'],
      ['zh-TW', 'zh-TW'],
      ['zh-Hant-TW', 'zh-TW'],
      // Case and `_` separators are tolerated: HTTP headers and og-style tags both reach storage.
      ['ZH-hant-tw', 'zh-TW'],
      ['zh_CN', 'zh-CN'],
      ['  zh-HK  ', 'zh-HK'],
    ]

    for (const [input, expected] of cases) {
      expect(normalizeAppLocale(input)).toBe(expected)
      expect(isKnownLocaleValue(input)).toBe(true)
    }
  })

  it('falls back to the default for unknown tags instead of failing', () => {
    for (const unknown of ['fr-FR', 'ja', 'klingon', '', 'zh-Hant']) {
      expect(normalizeAppLocale(unknown)).toBe(DEFAULT_LOCALE)
      expect(isKnownLocaleValue(unknown)).toBe(false)
    }
  })

  it('narrows with isSupportedLocale', () => {
    expect(isSupportedLocale('zh-TW')).toBe(true)
    expect(isSupportedLocale('zh')).toBe(false)
  })

  it('maps Open Graph locales to the underscore spelling', () => {
    expect(SUPPORTED_LOCALES.map((locale) => toOpenGraphLocale(locale))).toEqual(['en_US', 'zh_HK', 'zh_TW', 'zh_CN'])
  })

  it('labels each locale in its own language', () => {
    expect(Object.keys(LOCALE_DISPLAY_NAMES).sort()).toEqual([...SUPPORTED_LOCALES].sort())
    expect(LOCALE_DISPLAY_NAMES['en-US']).toBe('English (United States)')
    expect(LOCALE_DISPLAY_NAMES['zh-CN']).toBe('简体中文（中国大陆）')
  })
})
