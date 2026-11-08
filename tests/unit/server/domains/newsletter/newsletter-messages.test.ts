import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Newsletter subscription/confirmation validation across all four locales.
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const CASES: Case[] = [
  {
    key: 'newsletter.error.confirmFailed',
    messages: {
      'en-US': 'Subscription confirmation failed. Please try again later.',
      'zh-CN': '订阅确认失败，请稍后再试。',
      'zh-TW': '訂閱確認失敗，請稍後再試。',
      'zh-HK': '訂閱確認失敗，請稍後再試。',
    },
  },
  {
    key: 'newsletter.error.confirmMailFailed',
    messages: {
      'en-US': 'Sending the confirmation email failed. Please try again later.',
      'zh-CN': '确认邮件发送失败，请稍后再试。',
      'zh-TW': '確認郵件傳送失敗，請稍後再試。',
      'zh-HK': '確認郵件傳送失敗，請稍後再試。',
    },
  },
  {
    key: 'newsletter.error.disabled',
    messages: {
      'en-US': 'Email subscriptions are not open on this site yet.',
      'zh-CN': '站点暂未开放邮件订阅。',
      'zh-TW': '站點暫未開放郵件訂閱。',
      'zh-HK': '站點暫未開放郵件訂閱。',
    },
  },
  {
    key: 'newsletter.error.invalidConfirm',
    messages: {
      'en-US': 'The confirmation link is invalid or has expired; subscribe again.',
      'zh-CN': '确认链接无效或已过期，请重新订阅。',
      'zh-TW': '確認連結無效或已過期，請重新訂閱。',
      'zh-HK': '確認連結無效或已過期，請重新訂閱。',
    },
  },
  {
    key: 'newsletter.error.invalidId',
    messages: {
      'en-US': 'The subscription ID must be numeric',
      'zh-CN': '订阅 ID 必须是数字',
      'zh-TW': '訂閱 ID 必須是數字',
      'zh-HK': '訂閱 ID 必須是數字',
    },
  },
  {
    key: 'newsletter.error.invalidUnsubscribe',
    messages: {
      'en-US': 'The unsubscribe link is invalid.',
      'zh-CN': '退订链接无效。',
      'zh-TW': '取消訂閱連結無效。',
      'zh-HK': '取消訂閱連結無效。',
    },
  },
  {
    key: 'newsletter.error.rateLimited',
    messages: {
      'en-US': 'Too many requests. Please try again later.',
      'zh-CN': '请求过于频繁，请稍后再试。',
      'zh-TW': '請求過於頻繁，請稍後再試。',
      'zh-HK': '請求過於頻繁，請稍後再試。',
    },
  },
]

describe('newsletter messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
