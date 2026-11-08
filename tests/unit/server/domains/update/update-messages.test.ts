import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Self-update job/service errors across all four locales (pipeline diagnostics stay raw).
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const CASES: Case[] = [
  {
    key: 'update.error.alreadyLatest',
    messages: {
      'en-US': 'You are already on the latest version',
      'zh-CN': '当前已是最新版本',
      'zh-TW': '目前已是最新版本',
      'zh-HK': '目前已是最新版本',
    },
  },
  {
    key: 'update.error.jobRunning',
    messages: {
      'en-US': 'An update task is already running',
      'zh-CN': '已有更新任务正在进行中',
      'zh-TW': '已有更新任務正在進行中',
      'zh-HK': '已有更新任務正在進行中',
    },
  },
]

describe('update messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
