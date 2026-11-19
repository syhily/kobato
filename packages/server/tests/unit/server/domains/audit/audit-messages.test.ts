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
    key: 'audit.error.exportTooLarge',
    params: { max: 10000 },
    messages: {
      'en-US': 'The export exceeds the 10000-row limit; narrow the filters and try again.',
      'zh-CN': '导出记录数超过上限 10000 条，请缩小筛选范围后再试。',
      'zh-TW': '匯出記錄數超過上限 10000 筆，請縮小篩選範圍後再試。',
      'zh-HK': '匯出記錄數超過上限 10000 筆，請縮小篩選範圍後再試。',
    },
  },
  {
    key: 'audit.error.invalidActorId',
    messages: {
      'en-US': 'The actorId format is invalid',
      'zh-CN': 'actorId 格式无效',
      'zh-TW': 'actorId 格式無效',
      'zh-HK': 'actorId 格式無效',
    },
  },
]

describe('audit messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
