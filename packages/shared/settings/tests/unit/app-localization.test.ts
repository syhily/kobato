import type { BlogSettingsBundle } from '@kobato/settings/types.ts'

import { DEFAULT_LOCALE, type AppLocale } from '@kobato/i18n/locales.ts'
import {
  PRE_INSTALL_TIME_ZONE,
  captureAppSnapshot,
  createLazyAppSnapshot,
  resolveAppLocalization,
} from '@kobato/settings/app-localization.ts'
import { getBlogSettingsSnapshotSync } from '@kobato/settings/getters.ts'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings.ts'
import { describe, expect, it } from 'vitest'

const withIdentity = (locale: AppLocale, timeZone: string, timeFormat: string | null = null): BlogSettingsBundle => ({
  ...TEST_BLOG_SETTINGS_BUNDLE,
  siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale, timeZone, timeFormat },
})

describe('settings/app-localization', () => {
  it('reads the site locale, time zone, time format and snapshot revision', () => {
    const bundle = withIdentity('zh-TW', 'Asia/Taipei', 'yyyy/LL/dd')
    setBlogSettingsBundleForTests(bundle)

    expect(resolveAppLocalization()).toEqual({
      locale: 'zh-TW',
      timeZone: 'Asia/Taipei',
      timeFormat: 'yyyy/LL/dd',
      revision: getBlogSettingsSnapshotSync().revision,
      revisions: representationRevisionsFor(bundle),
    })
  })

  it('keeps locale and time zone independent', () => {
    const bundle = withIdentity('en-US', 'Asia/Shanghai')
    expect(resolveAppLocalization({ bundle, revision: 'boot-a:0000000007' })).toEqual({
      locale: 'en-US',
      timeZone: 'Asia/Shanghai',
      timeFormat: null,
      revision: 'boot-a:0000000007',
      revisions: representationRevisionsFor(bundle),
    })
  })

  it('falls back to the default locale + UTC pre-install, with an explicit revision', () => {
    setBlogSettingsBundleForTests(null)

    expect(resolveAppLocalization()).toEqual({
      locale: DEFAULT_LOCALE,
      timeZone: PRE_INSTALL_TIME_ZONE,
      timeFormat: null,
      revision: getBlogSettingsSnapshotSync().revision,
      revisions: representationRevisionsFor(null),
    })
  })

  it('accepts an explicit snapshot — background work has no request capture', () => {
    const bundle = withIdentity('zh-HK', 'Europe/London')
    expect(resolveAppLocalization({ bundle, revision: 'boot-b:0000000012' })).toEqual({
      locale: 'zh-HK',
      timeZone: 'Europe/London',
      timeFormat: null,
      revision: 'boot-b:0000000012',
      revisions: representationRevisionsFor(bundle),
    })
  })

  it('lazy capture pins the bundle, revision and localization for the request', () => {
    setBlogSettingsBundleForTests(withIdentity('en-US', 'UTC'))
    const lazy = createLazyAppSnapshot()

    const first = lazy()
    expect(first.settings?.siteIdentity?.locale).toBe('en-US')
    const pinnedRevision = first.localization.revision
    const pinnedRevisions = first.localization.revisions

    setBlogSettingsBundleForTests(withIdentity('zh-TW', 'Asia/Taipei'))

    expect(lazy()).toBe(first)
    expect(lazy().settings?.siteIdentity?.locale).toBe('en-US')
    expect(lazy().localization.revision).toBe(pinnedRevision)
    expect(lazy().localization.revisions).toBe(pinnedRevisions)

    const fresh = captureAppSnapshot()
    expect(fresh.settings?.siteIdentity?.locale).toBe('zh-TW')
    expect(fresh.localization.revision).not.toBe(pinnedRevision)
    expect(fresh.localization.revision > pinnedRevision).toBe(true)
    expect(fresh.localization.revisions.feed).not.toBe(pinnedRevisions.feed)
    expect(fresh.localization.revisions.calendar).not.toBe(pinnedRevisions.calendar)
  })
})
