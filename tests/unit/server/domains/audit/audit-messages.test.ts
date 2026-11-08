import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Audit log filter/export validation across all four locales.
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
