import type { ContentBootstrapI18n } from '@kobato/api/contracts/public/content'
import type { DocumentFonts } from '@kobato/ui/lib/document-facts-context'

import { fallbackMessages } from '@kobato/i18n/fallback-messages'
import { kobatoInklingLabelsZhTW } from '@kobato/i18n/inkling-labels/zh-TW'
import { DEFAULT_LOCALE } from '@kobato/i18n/locales'
import { uiMessagesZhTW } from '@kobato/i18n/messages/ui/zh-TW'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { describe, expect, it } from 'vitest'

import { documentFactsFrom } from '@/document/document-facts'

const FONTS: DocumentFonts = {
  global: [{ family: 'Noto Sans SC', href: '/fonts/global.woff2' }],
  post: [],
  code: [{ family: 'JetBrains Mono', href: '/fonts/code.woff2' }],
}

const I18N: ContentBootstrapI18n = {
  locale: 'zh-TW',
  revision: 'boot-1:0000000001',
  messages: uiMessagesZhTW,
  inklingLabels: kobatoInklingLabelsZhTW,
}

const FULL_LOADER_DATA = {
  admin: true,
  currentUser: null,
  installState: 'installed',
  i18n: I18N,
  theme: 'dark' as const,
  fonts: FONTS,
  blogSettings: TEST_BLOG_SETTINGS_BUNDLE,
  csrfToken: 'csrf-1',
}

const WITHOUT_I18N = {
  theme: 'light' as const,
  fonts: null,
  blogSettings: TEST_BLOG_SETTINGS_BUNDLE,
  csrfToken: 'csrf-1',
}

describe('document/document-facts — documentFactsFrom', () => {
  it('maps a full root loader payload into the document facts', () => {
    expect(documentFactsFrom(FULL_LOADER_DATA)).toEqual({
      locale: 'zh-TW',
      messages: uiMessagesZhTW,
      revision: 'boot-1:0000000001',
      theme: 'dark',
      fonts: FONTS,
      settings: TEST_BLOG_SETTINGS_BUNDLE,
      csrfToken: 'csrf-1',
      labels: kobatoInklingLabelsZhTW,
    })
  })

  it('falls back to the default locale and the fallback messages when i18n is missing', () => {
    const facts = documentFactsFrom(WITHOUT_I18N)
    expect(facts.locale).toBe(DEFAULT_LOCALE)
    expect(facts.messages).toBe(fallbackMessages)
    expect(facts.revision).toBeUndefined()
    expect(facts.labels).toBeUndefined()
    expect(facts.theme).toBe('light')
    expect(facts.fonts).toBeNull()
    expect(facts.settings).toBe(TEST_BLOG_SETTINGS_BUNDLE)
    expect(facts.csrfToken).toBe('csrf-1')
  })

  it('treats a null i18n payload exactly like a missing one', () => {
    expect(documentFactsFrom({ ...WITHOUT_I18N, i18n: null })).toEqual(documentFactsFrom(WITHOUT_I18N))
    expect(documentFactsFrom({ i18n: null })).toEqual(documentFactsFrom({}))
  })

  it('maps an empty object and absent loader data to the bare defaults', () => {
    const bare = {
      locale: DEFAULT_LOCALE,
      messages: fallbackMessages,
      theme: null,
      fonts: null,
      settings: undefined,
      csrfToken: undefined,
    }
    expect(documentFactsFrom({})).toEqual(bare)
    expect(documentFactsFrom(undefined)).toEqual(bare)
  })

  it('leaves the settings bundle undefined when it is missing or null, keeping the other facts', () => {
    const missing = documentFactsFrom({ ...FULL_LOADER_DATA, blogSettings: undefined })
    const nullBundle = documentFactsFrom({ ...FULL_LOADER_DATA, blogSettings: null })
    for (const facts of [missing, nullBundle]) {
      expect(facts.settings).toBeUndefined()
      expect(facts.locale).toBe('zh-TW')
      expect(facts.theme).toBe('dark')
      expect(facts.csrfToken).toBe('csrf-1')
      expect(facts.labels).toBe(kobatoInklingLabelsZhTW)
    }
  })
})
