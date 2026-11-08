import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Font table validation + upload/resource errors across all four locales.
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const PARAM_CASES: Case[] = [
  {
    key: 'fonts.error.inUse',
    params: { slots: 'body, serif' },
    messages: {
      'en-US':
        'The font is still referenced by these slots: body, serif. Remove it from them in /admin/library/fonts first.',
      'zh-CN': '字体仍被以下槽位引用：body, serif。请先在 /admin/library/fonts 中将其从这些槽位移除。',
      'zh-TW': '字型仍被以下槽位引用：body, serif。請先在 /admin/library/fonts 中將其從這些槽位移除。',
      'zh-HK': '字型仍被以下槽位引用：body, serif。請先在 /admin/library/fonts 中將其從這些槽位移除。',
    },
  },
  {
    key: 'fonts.error.tableTruncated',
    params: { index: 2, total: 5 },
    messages: {
      'en-US': 'The font file is incomplete: the table directory is truncated (table 2/5)',
      'zh-CN': '字体文件不完整：表目录被截断（表 2/5）',
      'zh-TW': '字型檔案不完整：表目錄被截斷（表 2/5）',
      'zh-HK': '字型檔案不完整：表目錄被截斷（表 2/5）',
    },
  },
  {
    key: 'fonts.error.tableOutOfBounds',
    params: { tag: 'name', offset: 10, length: 20, size: 25 },
    messages: {
      'en-US':
        'The font file is incomplete: the name table extends past the end of the file (offset 10 + length 20 > file size 25); use a complete font file',
      'zh-CN': '字体文件不完整：name 表超出文件末尾（偏移 10 + 长度 20 > 文件大小 25），请使用完整的字体文件',
      'zh-TW': '字型檔案不完整：name 表超出檔案末尾（偏移 10 + 長度 20 > 檔案大小 25），請使用完整的字型檔案',
      'zh-HK': '字型檔案不完整：name 表超出檔案末尾（偏移 10 + 長度 20 > 檔案大小 25），請使用完整的字型檔案',
    },
  },
  {
    key: 'fonts.error.tooLarge',
    params: { max: 1024 },
    messages: {
      'en-US': 'The font exceeds the size limit (1024 bytes)',
      'zh-CN': '字体体积超过上限（1024 字节）',
      'zh-TW': '字型大小超過上限（1024 位元組）',
      'zh-HK': '字型大小超過上限（1024 位元組）',
    },
  },
  {
    key: 'fonts.error.packageTooLarge',
    params: { max: '10 MB' },
    messages: {
      'en-US': 'The uploaded file is too large (limit 10 MB)',
      'zh-CN': '上传文件过大（上限 10 MB）',
      'zh-TW': '上傳檔案過大（上限 10 MB）',
      'zh-HK': '上傳檔案過大（上限 10 MB）',
    },
  },
]

const PLAIN_KEYS: UiMessageId[] = [
  'fonts.error.notFound',
  'fonts.error.wrongFormat',
  'fonts.error.unknownSlot',
  'fonts.error.packageMissing',
  'fonts.error.nameRequired',
  'fonts.error.tableDirectory',
]

describe('fonts messages — four locales', () => {
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
