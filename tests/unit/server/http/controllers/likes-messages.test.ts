import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Like throttling and stale-token errors across all four locales.
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const CASES: Case[] = [
  {
    key: 'likes.error.rateLimited',
    messages: {
      'en-US': 'Too many likes. Please try again later.',
      'zh-CN': '点赞过于频繁，请稍后再试。',
      'zh-TW': '按讚過於頻繁，請稍後再試。',
      'zh-HK': '按讚過於頻繁，請稍後再試。',
    },
  },
  {
    key: 'likes.error.stale',
    messages: {
      'en-US': 'The like state has expired; refresh the page and try again',
      'zh-CN': '点赞状态已失效，请刷新页面后重试',
      'zh-TW': '按讚狀態已失效，請重新整理頁面後再試',
      'zh-HK': '按讚狀態已失效，請重新整理頁面後再試',
    },
  },
]

describe('likes messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
