import { describe, expect, it } from 'vitest'

import type { AppLocale } from '@/shared/i18n/locales'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// The admin cache card maps a rejected target back to a descriptor; the client
// renders the localized sentence, never the raw key.
const EXPECTED: Record<AppLocale, string> = {
  'en-US': 'Unknown cache group: nope',
  'zh-CN': '未知的缓存分组：nope',
  'zh-TW': '未知的快取分組：nope',
  'zh-HK': '未知的快取分組：nope',
}

describe('admin cache error message — four locales', () => {
  it.each(SUPPORTED_LOCALES)('resolves in %s', (locale: AppLocale) => {
    const descriptor = descriptorFor('admin.cache.error.unknownGroup', { target: 'nope' })
    expect(descriptor.messageKey).toBe('admin.cache.error.unknownGroup')
    expect(createServerTranslator(locale).format(descriptor.messageKey, descriptor.params)).toBe(EXPECTED[locale])
  })

  it('keeps an English fallback with no Han characters', () => {
    expect(descriptorFor('admin.cache.error.unknownGroup', { target: 'nope' }).fallbackMessage).not.toMatch(
      /[\u3400-\u4DBF\u4E00-\u9FFF]/,
    )
  })
})
