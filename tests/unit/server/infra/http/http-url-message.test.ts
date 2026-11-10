import { describe, expect, it } from 'vitest'

import type { AppLocale } from '@/shared/i18n/locales'

import { applyFriendSchema } from '@/server/domains/friends/schema'
import { zodIssueToWire } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'
import { HTTP_URL_MESSAGE, optionalHttpUrlSchema } from '@/shared/utils/safe-url'

// The shared http(s)-URL rule states a catalog id, not prose: every schema reusing it
// (admin user links, friend applications, …) produces the same descriptor through
// `zodIssuesToWire`, so the reader sees the localized sentence — never the key.

const EXPECTED: Record<AppLocale, string> = {
  'en-US': 'Enter an http(s) URL',
  'zh-CN': '请输入 http(s) URL',
  'zh-TW': '請輸入 http(s) URL',
  'zh-HK': '請輸入 http(s) URL',
}

describe('shared http(s)-URL message', () => {
  it('is a typed catalog id, not prose', () => {
    expect(HTTP_URL_MESSAGE).toBe('common.error.httpUrlRequired')
    expect(HTTP_URL_MESSAGE).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })

  it.each(SUPPORTED_LOCALES)('resolves in %s', (locale: AppLocale) => {
    expect(createServerTranslator(locale).format(HTTP_URL_MESSAGE)).toBe(EXPECTED[locale])
  })

  it('maps the shared schema issue onto the descriptor (no raw prose, no leaked key)', () => {
    const result = optionalHttpUrlSchema.safeParse('ftp://example.com/file')
    expect(result.success).toBe(false)
    const issue = result.error!.issues[0]!

    const wire = zodIssueToWire(issue)
    expect(wire.messageKey).toBe('common.error.httpUrlRequired')
    expect(wire.fallbackMessage).toBe(EXPECTED['en-US'])
    expect(wire.fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
    expect(wire.fallbackMessage).not.toContain('common.error.')

    for (const locale of SUPPORTED_LOCALES) {
      const localized = createServerTranslator(locale).format(wire.messageKey, wire.params)
      expect(localized).toBe(EXPECTED[locale])
      expect(localized).not.toContain('common.error.')
    }
  })

  it('reuses the same descriptor for the friend-application schema', () => {
    const result = applyFriendSchema.safeParse({
      website: 'Friend',
      homepage: 'ftp://example.com',
      contact: '',
    })
    expect(result.success).toBe(false)
    const issue = result.error!.issues.find((entry) => entry.path[0] === 'homepage')!
    expect(zodIssueToWire(issue)).toMatchObject({
      messageKey: 'common.error.httpUrlRequired',
      fallbackMessage: EXPECTED['en-US'],
      path: ['homepage'],
    })
  })

  it('accepts http(s) URLs and the empty optional form', () => {
    expect(optionalHttpUrlSchema.safeParse('https://example.com').success).toBe(true)
    expect(optionalHttpUrlSchema.safeParse('').success).toBe(true)
  })
})
