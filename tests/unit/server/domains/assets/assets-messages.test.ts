import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const PARAM_CASES: Case[] = [
  {
    key: 'assets.error.slotFormat',
    params: { slot: 'logo', type: 'SVG' },
    messages: {
      'en-US': 'logo must be a SVG file',
      'zh-CN': 'logo 必须是 SVG 格式文件',
      'zh-TW': 'logo 必須是 SVG 格式檔案',
      'zh-HK': 'logo 必須是 SVG 格式檔案',
    },
  },
  {
    key: 'assets.error.slotTooLarge',
    params: { slot: 'icon192', max: 1024 },
    messages: {
      'en-US': 'The icon192 file exceeds the 1024-byte limit',
      'zh-CN': 'icon192 文件超过 1024 字节上限',
      'zh-TW': 'icon192 檔案超過 1024 位元組上限',
      'zh-HK': 'icon192 檔案超過 1024 位元組上限',
    },
  },
]

const PLAIN_KEYS: UiMessageId[] = [
  'assets.error.settingsNotInstalled',
  'assets.error.invalidSvg',
  'assets.error.svgScript',
  'common.error.uploadEmpty',
  'common.error.uploadTooLarge',
  'common.error.uploadMissing',
]

describe('assets messages — four locales', () => {
  it.each(PARAM_CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(PARAM_CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })

  it.each(PLAIN_KEYS)('%s resolves in every locale without leftover placeholders', (key) => {
    for (const locale of SUPPORTED_LOCALES) {
      const message = createServerTranslator(locale).format(key)
      expect(message).not.toBe('')
      expect(message).not.toMatch(/[{}]/)
    }
  })
})
