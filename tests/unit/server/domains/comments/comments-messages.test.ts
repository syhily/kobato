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
    key: 'comments.error.notFound',
    messages: {
      'en-US': 'The comment does not exist.',
      'zh-CN': '评论不存在。',
      'zh-TW': '留言不存在。',
      'zh-HK': '留言不存在。',
    },
  },
  {
    key: 'comments.error.tooManyLinks',
    params: { max: 5 },
    messages: {
      'en-US': 'Too many links in the comment (at most 5).',
      'zh-CN': '评论中链接过多（最多 5 个）。',
      'zh-TW': '留言中連結過多（最多 5 個）。',
      'zh-HK': '留言中連結過多（最多 5 個）。',
    },
  },
  {
    key: 'comments.error.muted',
    messages: {
      'en-US': 'Your commenting has been disabled by the administrator. Contact the site owner if you have questions.',
      'zh-CN': '您的评论功能已被管理员禁用，如有疑问请联系站长。',
      'zh-TW': '您的留言功能已被管理員停用，如有疑問請聯絡站長。',
      'zh-HK': '您的留言功能已被管理員停用，如有疑問請聯絡站長。',
    },
  },
  {
    key: 'comments.error.duplicate',
    messages: {
      'en-US':
        'Duplicate comment: you already posted the same message. If it is not visible, it is waiting for moderation.',
      'zh-CN': '重复评论，你已经有了相同的留言，如果在页面看不到，说明它正在等待站长审核。',
      'zh-TW': '重複留言，你已經有相同的內容；若在頁面看不到，表示它正在等待站長審核。',
      'zh-HK': '重複留言，你已經有相同的內容；若在頁面看不到，表示它正在等待站長審核。',
    },
  },
  {
    key: 'comments.error.contentTooLong',
    params: { max: 10000 },
    messages: {
      'en-US': 'The comment is too long (at most 10000 characters).',
      'zh-CN': '评论内容过长，最多 10000 个字符。',
      'zh-TW': '留言內容過長，最多 10000 個字元。',
      'zh-HK': '留言內容過長，最多 10000 個字元。',
    },
  },
  {
    key: 'webmentions.error.notFound',
    messages: {
      'en-US': 'The Webmention does not exist.',
      'zh-CN': 'Webmention 不存在。',
      'zh-TW': 'Webmention 不存在。',
      'zh-HK': 'Webmention 不存在。',
    },
  },
  {
    key: 'webmentions.error.rejected',
    messages: {
      'en-US': 'Rejected Webmentions are no longer verified.',
      'zh-CN': '已拒绝的 Webmention 不再参与验证。',
      'zh-TW': '已拒絕的 Webmention 不再參與驗證。',
      'zh-HK': '已拒絕的 Webmention 不再參與驗證。',
    },
  },
]

describe('comments + webmentions messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
