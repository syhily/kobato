import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Notification service validation across all four locales (message title/body are user content).
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const CASES: Case[] = [
  {
    key: 'notifications.error.messageNotFound',
    messages: {
      'en-US': 'The message does not exist',
      'zh-CN': '消息不存在',
      'zh-TW': '訊息不存在',
      'zh-HK': '訊息不存在',
    },
  },
  {
    key: 'notifications.error.noAdminRecipients',
    messages: {
      'en-US': 'No administrator can receive replies right now',
      'zh-CN': '当前没有管理员可以接收回复',
      'zh-TW': '目前沒有管理員可以接收回覆',
      'zh-HK': '目前沒有管理員可以接收回覆',
    },
  },
  {
    key: 'notifications.error.noAudience',
    messages: {
      'en-US': 'There are no other users on this site, so nobody can receive the announcement',
      'zh-CN': '站点内还没有其他用户，公告无人可接收',
      'zh-TW': '站點內還沒有其他使用者，公告無人可接收',
      'zh-HK': '站點內還沒有其他使用者，公告無人可接收',
    },
  },
  {
    key: 'notifications.error.noRecipients',
    messages: {
      'en-US': 'The notification has no deliverable recipients',
      'zh-CN': '通知没有可投递的收件人',
      'zh-TW': '通知沒有可投遞的收件人',
      'zh-HK': '通知沒有可投遞的收件人',
    },
  },
  {
    key: 'notifications.error.noThreadRecipients',
    messages: {
      'en-US': 'This thread has no recipient for a reply',
      'zh-CN': '该线程没有可接收回复的对象',
      'zh-TW': '該討論串沒有可接收回覆的對象',
      'zh-HK': '該討論串沒有可接收回覆的對象',
    },
  },
  {
    key: 'notifications.error.notReplyable',
    messages: {
      'en-US': 'This message does not support replies',
      'zh-CN': '该消息不支持回复',
      'zh-TW': '該訊息不支援回覆',
      'zh-HK': '該訊息不支援回覆',
    },
  },
  {
    key: 'notifications.error.recallDirect',
    messages: {
      'en-US': 'Direct messages cannot be recalled',
      'zh-CN': '私信不支持撤回',
      'zh-TW': '私訊不支援撤回',
      'zh-HK': '私訊不支援撤回',
    },
  },
  {
    key: 'notifications.error.selfDirect',
    messages: {
      'en-US': 'You cannot send a direct message to yourself',
      'zh-CN': '不能给自己发送私信',
      'zh-TW': '不能給自己傳送私訊',
      'zh-HK': '不能給自己傳送私訊',
    },
  },
  {
    key: 'notifications.error.targetNotFound',
    messages: {
      'en-US': 'The target user does not exist',
      'zh-CN': '目标用户不存在',
      'zh-TW': '目標使用者不存在',
      'zh-HK': '目標使用者不存在',
    },
  },
]

describe('notifications messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
