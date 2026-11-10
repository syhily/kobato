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

const CASES: Case[] = [
  {
    key: 'friends.error.alreadyApplied',
    messages: {
      'en-US': 'A friend-link application for this homepage has already been submitted; do not submit it again.',
      'zh-CN': '该主页已经提交过友链申请，请勿重复提交。',
      'zh-TW': '該首頁已經提交過友鏈申請，請勿重複提交。',
      'zh-HK': '該首頁已經提交過友鏈申請，請勿重複提交。',
    },
  },
  {
    key: 'friends.error.duplicateHomepage',
    messages: {
      'en-US': 'A friend link with the same homepage URL already exists',
      'zh-CN': '已存在相同主页 URL 的友链',
      'zh-TW': '已存在相同首頁 URL 的友鏈',
      'zh-HK': '已存在相同首頁 URL 的友鏈',
    },
  },
  {
    key: 'friends.error.homepageSubmitted',
    messages: {
      'en-US': 'This homepage URL has already been submitted',
      'zh-CN': '主页 URL 已提交过',
      'zh-TW': '首頁 URL 已提交過',
      'zh-HK': '首頁 URL 已提交過',
    },
  },
  {
    key: 'friends.error.homepageTaken',
    messages: {
      'en-US': 'This homepage URL is already taken',
      'zh-CN': '主页 URL 已存在',
      'zh-TW': '首頁 URL 已存在',
      'zh-HK': '首頁 URL 已存在',
    },
  },
  {
    key: 'friends.error.notFound',
    messages: {
      'en-US': 'The friend link does not exist',
      'zh-CN': '友链不存在',
      'zh-TW': '友鏈不存在',
      'zh-HK': '友鏈不存在',
    },
  },
]

describe('friends messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
