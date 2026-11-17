import type { ErrorMessageParams } from '@kobato/contracts/api-error.ts'
import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'

import { SUPPORTED_LOCALES } from '@kobato/i18n/locales.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import { describe, expect, it } from 'vitest'

interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const CASES: Case[] = [
  {
    key: 'public.search.resultTitle',
    params: { query: 'react' },
    messages: {
      'en-US': 'Search results for "react"',
      'zh-CN': '【react】搜索结果',
      'zh-TW': '【react】搜尋結果',
      'zh-HK': '【react】搜尋結果',
    },
  },
]

describe('search messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
