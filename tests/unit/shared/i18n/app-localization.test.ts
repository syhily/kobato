import { describe, expect, it } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import {
  PRE_INSTALL_TIME_ZONE,
  createLazyAppLocalization,
  resolveAppLocalization,
} from '@/shared/i18n/app-localization'
import { DEFAULT_LOCALE, type AppLocale } from '@/shared/i18n/locales'

const withIdentity = (locale: AppLocale, timeZone: string): BlogSettingsBundle => ({
  ...TEST_BLOG_SETTINGS_BUNDLE,
  siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale, timeZone },
})

describe('shared/i18n/app-localization', () => {
  it('reads the site locale and time zone from the settings snapshot', () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale: 'zh-TW', timeZone: 'Asia/Taipei' },
    })

    expect(resolveAppLocalization()).toEqual({ locale: 'zh-TW', timeZone: 'Asia/Taipei' })
  })

  it('keeps locale and time zone independent', () => {
    // A perfectly valid combination — never infer the zone from the language.
    expect(resolveAppLocalization(withIdentity('en-US', 'Asia/Shanghai'))).toEqual({
      locale: 'en-US',
      timeZone: 'Asia/Shanghai',
    })
  })

  it('falls back to the default locale + UTC pre-install', () => {
    setBlogSettingsBundleForTests(null)

    expect(resolveAppLocalization()).toEqual({ locale: DEFAULT_LOCALE, timeZone: PRE_INSTALL_TIME_ZONE })
  })

  it('accepts an explicit bundle — background work has no request snapshot', () => {
    expect(resolveAppLocalization(withIdentity('zh-HK', 'Europe/London'))).toEqual({
      locale: 'zh-HK',
      timeZone: 'Europe/London',
    })
  })

  it('lazy accessor resolves once and pins the pair for the request', () => {
    setBlogSettingsBundleForTests(null)
    const lazy = createLazyAppLocalization()

    // Cold access (pre-hydration) pins the default pair…
    expect(lazy()).toEqual({ locale: DEFAULT_LOCALE, timeZone: PRE_INSTALL_TIME_ZONE })
    setBlogSettingsBundleForTests(withIdentity('zh-TW', 'Asia/Taipei'))
    expect(lazy()).toEqual({ locale: DEFAULT_LOCALE, timeZone: PRE_INSTALL_TIME_ZONE })

    // …while an accessor created after hydration sees the site pair.
    expect(createLazyAppLocalization()()).toEqual({ locale: 'zh-TW', timeZone: 'Asia/Taipei' })
  })
})
