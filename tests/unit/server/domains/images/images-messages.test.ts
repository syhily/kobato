import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Image upload / safe-segment / worker errors across all four locales. Machine
// kinds (`categorySlug` / `friendHost`, `audio` / `cover`) cross the wire, never
// a pre-translated label — the catalog's ICU `select` renders them.
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const PARAM_CASES: Case[] = [
  {
    key: 'images.error.tooLarge',
    params: { max: '1.0 MB' },
    messages: {
      'en-US': 'The image exceeds the size limit (1.0 MB)',
      'zh-CN': '图片体积超过上限（1.0 MB）',
      'zh-TW': '圖片大小超過上限（1.0 MB）',
      'zh-HK': '圖片大小超過上限（1.0 MB）',
    },
  },
  {
    key: 'images.error.unsafeSegment',
    params: { segment: 'friendHost' },
    messages: {
      'en-US': 'Friend-link host may only use ASCII letters, digits, ".", "_" and "-"',
      'zh-CN': '友链 host只能使用 ASCII 字母、数字、`.`、`_`、`-`',
      'zh-TW': '友鏈 host只能使用 ASCII 字母、數字、`.`、`_`、`-`',
      'zh-HK': '友鏈 host只能使用 ASCII 字母、數字、`.`、`_`、`-`',
    },
  },
  {
    key: 'images.error.illegalSegmentValue',
    params: { segment: 'categorySlug', value: 'a/b' },
    messages: {
      'en-US': 'Invalid category slug: "a/b"',
      'zh-CN': '非法分类 slug: `a/b`',
      'zh-TW': '非法分類 slug: `a/b`',
      'zh-HK': '非法分類 slug: `a/b`',
    },
  },
  {
    key: 'images.error.worker.tooLarge',
    params: { megapixels: 50 },
    messages: {
      'en-US': 'The image is too large (limit 50 megapixels)',
      'zh-CN': '图片尺寸过大（上限 50 百万像素）',
      'zh-TW': '圖片尺寸過大（上限 50 百萬像素）',
      'zh-HK': '圖片尺寸過大（上限 50 百萬像素）',
    },
  },
]

const PLAIN_KEYS: UiMessageId[] = [
  'images.error.notFound',
  'images.error.objectMissing',
  'images.error.storageFetchFailed',
  'images.error.unsupportedFormat',
  'images.error.metadataWriteFailed',
  'images.error.invalidHomepageUrl',
  'images.error.homepageUrlInvalid',
  'images.error.worker.unreadable',
  'images.error.worker.invalidDimensions',
  'images.error.worker.reencodeFailed',
  'images.error.adminOnlyKinds',
]

describe('images messages — four locales', () => {
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
