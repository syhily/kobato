import type { BlogSettingsBundle } from '@kobato/settings/types.ts'
import type { MetaDescriptor } from 'react-router'

import { fallbackMessages } from '@kobato/i18n/fallback-messages.ts'
import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN.ts'
import { uiMessagesZhTW } from '@kobato/i18n/messages/ui/zh-TW.ts'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { describe, expect, it } from 'vitest'

import { titleMeta } from '@/seo/title-meta.ts'

// `titleMeta` resolves the bundle / i18n payload from the root match, never
// the settings snapshot — every test clears the snapshot first, so client
// navigation (where no server section exists) is what's actually exercised.
type MetaEntry = MetaDescriptor & Record<string, unknown>

function findByName(meta: MetaEntry[], name: string) {
  return meta.find((m) => m.name === name) as MetaEntry | undefined
}

const rootMatchWithI18n = (
  locale: 'zh-CN' | 'zh-TW',
  bundle: BlogSettingsBundle | null = TEST_BLOG_SETTINGS_BUNDLE,
) => [{ id: 'root', loaderData: { blogSettings: bundle, i18n: { locale, messages: MESSAGES[locale] } } }]

const MESSAGES = {
  'zh-CN': uiMessagesZhCN,
  'zh-TW': uiMessagesZhTW,
}

describe('seo/title-meta — titleMeta', () => {
  it('resolves through matches on client navigation without any snapshot', () => {
    setBlogSettingsBundleForTests(null)
    const meta = titleMeta('meta.title.auth.signin')({ matches: rootMatchWithI18n('zh-CN') }) as MetaEntry[]

    expect(meta[0]?.title).toBe(`用户登陆 - ${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title}`)
  })

  it('uses the shared fallback module for the pre-install title without matches', () => {
    setBlogSettingsBundleForTests(null)
    const meta = titleMeta('meta.title.auth.setup')({ matches: [] }) as MetaEntry[]

    expect(meta[0]).toMatchObject({ title: fallbackMessages['meta.preinstall'] })
    expect(findByName(meta, 'robots')?.content).toBe('noindex,follow')
  })

  it('localizes the pre-install title through matches', () => {
    // Pre-install: no settings row anywhere — the payload still carries the locale's catalog.
    setBlogSettingsBundleForTests(null)
    const meta = titleMeta('meta.title.auth.setup')({
      matches: rootMatchWithI18n('zh-TW', null),
    }) as MetaEntry[]

    // `<title>` + the two noindex robots tags; no site chrome at all.
    expect(meta).toHaveLength(3)
    expect(meta[0]).toMatchObject({ title: '建立網站' })
    expect(findByName(meta, 'robots')?.content).toBe('noindex,follow')
  })
})
