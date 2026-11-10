import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// The wrong-password descriptor is the stable identity the client matches, never prose.
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const CASES: Case[] = [
  {
    key: 'backup.error.passwordWrong',
    messages: {
      'en-US': 'The backup password is incorrect or the file is corrupted.',
      'zh-CN': '备份密码错误或文件已损坏',
      'zh-TW': '備份密碼錯誤或檔案已損壞',
      'zh-HK': '備份密碼錯誤或檔案已損壞',
    },
  },
  {
    key: 'backup.error.fileTooLarge',
    messages: {
      'en-US': 'The backup file is too large; check that it is not corrupted.',
      'zh-CN': '备份文件过大，请确认文件未损坏。',
      'zh-TW': '備份檔案過大，請確認檔案未損壞。',
      'zh-HK': '備份檔案過大，請確認檔案未損壞。',
    },
  },
  {
    key: 'backup.error.restoreRunning',
    messages: {
      'en-US': 'A restore is already running. Please wait for it to finish.',
      'zh-CN': '已有还原任务正在进行，请等待完成后再试。',
      'zh-TW': '已有還原任務正在進行，請等待完成後再試。',
      'zh-HK': '已有還原任務正在進行，請等待完成後再試。',
    },
  },
  {
    key: 'backup.error.configRejected',
    params: { message: 'sessionSecret too short' },
    messages: {
      'en-US':
        'The config file inside the archive failed server validation; the restore was aborted: sessionSecret too short',
      'zh-CN': '备份归档中的配置文件无法通过服务端校验，还原已中止:sessionSecret too short',
      'zh-TW': '備份封存中的設定檔無法通過伺服器端驗證，還原已中止:sessionSecret too short',
      'zh-HK': '備份封存中的設定檔無法通過伺服器端驗證，還原已中止:sessionSecret too short',
    },
  },
  {
    key: 'backup.error.uploadExpired',
    messages: {
      'en-US': 'The upload session has expired; upload the backup file again.',
      'zh-CN': '上传会话已过期，请重新上传备份文件。',
      'zh-TW': '上傳工作階段已過期，請重新上傳備份檔案。',
      'zh-HK': '上傳工作階段已過期，請重新上傳備份檔案。',
    },
  },
  {
    key: 'backup.error.weeklyDayRequired',
    messages: {
      'en-US': 'Weekly backups must specify a weekday from 1 to 7.',
      'zh-CN': '每周备份必须指定 1–7 的星期几。',
      'zh-TW': '每週備份必須指定 1–7 的星期幾。',
      'zh-HK': '每週備份必須指定 1–7 的星期幾。',
    },
  },
  {
    key: 'backup.error.monthlyDayRequired',
    messages: {
      'en-US': 'Monthly backups must specify a day of month from 1 to 31.',
      'zh-CN': '每月备份必须指定 1–31 的日期。',
      'zh-TW': '每月備份必須指定 1–31 的日期。',
      'zh-HK': '每月備份必須指定 1–31 的日期。',
    },
  },
]

describe('backup messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
