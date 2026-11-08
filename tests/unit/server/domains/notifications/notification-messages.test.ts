import { describe, expect, it } from 'vitest'

import type { AppLocale } from '@/shared/i18n/locales'
import type { ServerMessageId } from '@/shared/i18n/messages/server/en-US'

import { createServerTranslator, isServerMessageId } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'
import { serverMessagesEnUS } from '@/shared/i18n/messages/server/en-US'

// `notification.*` keys are PERSISTED in notification rows, so they are
// append-only: this test freezes the released set and pins every locale's
// copy. Adding a notification type appends a key here; renaming or deleting
// one must never happen (an old row would lose its translation).

const RELEASED_NOTIFICATION_KEYS = [
  'notification.job.failed.body',
  'notification.job.failed.title',
  'notification.mail.zeaburCleanup.body',
  'notification.mail.zeaburCleanup.title',
] as const

interface Case {
  key: ServerMessageId
  params?: Record<string, string | number>
  messages: Record<AppLocale, string>
}

const FAILED_TITLE = { taskKey: 'backup' }
const FAILED_BODY_WITH_ERROR = { taskKey: 'backup', hasError: 'yes', error: 'disk full' }
const FAILED_BODY_WITHOUT_ERROR = { taskKey: 'backup', hasError: 'no', error: '' }

const CASES: Case[] = [
  {
    key: 'notification.job.failed.title',
    params: FAILED_TITLE,
    messages: {
      'en-US': 'Background task failed: backup',
      'zh-CN': '后台任务失败：backup',
      'zh-TW': '後台任務失敗：backup',
      'zh-HK': '後台任務失敗：backup',
    },
  },
  {
    key: 'notification.job.failed.body',
    params: FAILED_BODY_WITH_ERROR,
    messages: {
      'en-US': 'Task backup failed on its most recent run: disk full Open the Tasks page for details.',
      'zh-CN': '任务「backup」最近一次执行失败：disk full请到「任务」页面查看详情。',
      'zh-TW': '任務「backup」最近一次執行失敗：disk full請到「任務」頁面檢視詳情。',
      'zh-HK': '任務「backup」最近一次執行失敗：disk full請到「任務」頁面檢視詳情。',
    },
  },
  {
    key: 'notification.job.failed.body',
    params: FAILED_BODY_WITHOUT_ERROR,
    messages: {
      'en-US': 'Task backup failed on its most recent run. Open the Tasks page for details.',
      'zh-CN': '任务「backup」最近一次执行失败。请到「任务」页面查看详情。',
      'zh-TW': '任務「backup」最近一次執行失敗。請到「任務」頁面檢視詳情。',
      'zh-HK': '任務「backup」最近一次執行失敗。請到「任務」頁面檢視詳情。',
    },
  },
  {
    key: 'notification.mail.zeaburCleanup.title',
    messages: {
      'en-US': 'Mail sending was turned off automatically',
      'zh-CN': '邮件服务已自动关闭',
      'zh-TW': '郵件服務已自動關閉',
      'zh-HK': '郵件服務已自動關閉',
    },
  },
  {
    key: 'notification.mail.zeaburCleanup.body',
    messages: {
      'en-US':
        'The Zeabur mail service is gone. This site still used it, so sending was turned off automatically. Reconfigure SMTP or Mailgun under「Settings → Mail」and turn it back on.',
      'zh-CN':
        'Zeabur 邮件服务已下线，系统检测到站点仍在使用它，已自动关闭邮件发送。请到「系统设置 → 邮件」重新配置 SMTP 或 Mailgun 后重新启用。',
      'zh-TW':
        'Zeabur 郵件服務已下線，系統偵測到站點仍在使用它，已自動關閉郵件傳送。請到「系統設定 → 郵件」重新設定 SMTP 或 Mailgun 後重新啟用。',
      'zh-HK':
        'Zeabur 郵件服務已下線，系統偵測到站點仍在使用它，已自動關閉郵件傳送。請到「系統設定 → 郵件」重新設定 SMTP 或 Mailgun 後重新啟用。',
    },
  },
]

describe('server notification messages — four locales', () => {
  it('keeps the released key set append-only', () => {
    const catalogKeys = (Object.keys(serverMessagesEnUS) as ServerMessageId[]).filter((key) =>
      key.startsWith('notification.'),
    )
    // The set may GROW; it must never shrink or rename an existing entry.
    expect(catalogKeys).toEqual(expect.arrayContaining([...RELEASED_NOTIFICATION_KEYS]))
    for (const key of RELEASED_NOTIFICATION_KEYS) {
      expect(isServerMessageId(key)).toBe(true)
    }
  })

  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(createServerTranslator('en-US').format(key, params)).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
