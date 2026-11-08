import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// User administration + account validation errors across all four locales.
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const CASES: Case[] = [
  {
    key: 'account.error.passwordWrong',
    messages: {
      'en-US': 'The current password is incorrect.',
      'zh-CN': '原密码错误。',
      'zh-TW': '原密碼錯誤。',
      'zh-HK': '原密碼錯誤。',
    },
  },
  {
    key: 'users.error.cannotChangeOwnRole',
    messages: {
      'en-US': 'You cannot change your own role.',
      'zh-CN': '不能修改自己的角色。',
      'zh-TW': '不能修改自己的角色。',
      'zh-HK': '不能修改自己的角色。',
    },
  },
  {
    key: 'users.error.cannotDeleteSelf',
    messages: {
      'en-US': 'You cannot delete yourself.',
      'zh-CN': '不能删除自己。',
      'zh-TW': '不能刪除自己。',
      'zh-HK': '不能刪除自己。',
    },
  },
  {
    key: 'users.error.cannotDeleteSoleAdmin',
    messages: {
      'en-US': 'The only administrator cannot be deleted.',
      'zh-CN': '不能删除唯一的管理员。',
      'zh-TW': '不能刪除唯一的管理員。',
      'zh-HK': '不能刪除唯一的管理員。',
    },
  },
  {
    key: 'users.error.cannotDemoteSoleAdmin',
    messages: {
      'en-US': 'The only administrator cannot be demoted.',
      'zh-CN': '不能降级唯一的管理员。',
      'zh-TW': '不能降級唯一的管理員。',
      'zh-HK': '不能降級唯一的管理員。',
    },
  },
  {
    key: 'users.error.createAuthorFailed',
    messages: {
      'en-US': 'Creating the author account failed.',
      'zh-CN': '创建作者账户失败。',
      'zh-TW': '建立作者帳戶失敗。',
      'zh-HK': '建立作者帳戶失敗。',
    },
  },
  {
    key: 'users.error.deleteNotFound',
    messages: {
      'en-US': 'The user does not exist or has already been deleted',
      'zh-CN': '用户不存在或已被删除',
      'zh-TW': '使用者不存在或已被刪除',
      'zh-HK': '使用者不存在或已被刪除',
    },
  },
  {
    key: 'users.error.emailTaken',
    messages: {
      'en-US': 'That email is already registered.',
      'zh-CN': '该邮箱已被注册。',
      'zh-TW': '該電子郵件已被註冊。',
      'zh-HK': '該電子郵件已被註冊。',
    },
  },
  {
    key: 'users.error.inviteTooFrequent',
    messages: {
      'en-US': 'Invitations are being sent too often. Please try again later.',
      'zh-CN': '邀请发送过于频繁，请稍后再试。',
      'zh-TW': '邀請傳送過於頻繁，請稍後再試。',
      'zh-HK': '邀請傳送過於頻繁，請稍後再試。',
    },
  },
  {
    key: 'users.error.mailFailedCleanupFailed',
    messages: {
      'en-US':
        'Sending the email failed, and cleaning up the account also failed. That email may already be taken — resolve it manually.',
      'zh-CN': '邮件发送失败，且账户清理失败。该邮箱已被占用，请手动处理。',
      'zh-TW': '郵件傳送失敗，且帳戶清理失敗。該電子郵件已被佔用，請手動處理。',
      'zh-HK': '郵件傳送失敗，且帳戶清理失敗。該電子郵件已被佔用，請手動處理。',
    },
  },
  {
    key: 'users.error.mailFailedRolledBack',
    messages: {
      'en-US': 'Sending the email failed; the account creation was rolled back.',
      'zh-CN': '邮件发送失败，已回滚账户创建。',
      'zh-TW': '郵件傳送失敗，已回滾帳戶建立。',
      'zh-HK': '郵件傳送失敗，已回滾帳戶建立。',
    },
  },
  {
    key: 'users.error.muteTargetNotFound',
    messages: {
      'en-US': 'The user does not exist or is an administrator (administrators cannot be muted)',
      'zh-CN': '用户不存在或为管理员（管理员不可禁言）',
      'zh-TW': '使用者不存在或為管理員（管理員不可禁言）',
      'zh-HK': '使用者不存在或為管理員（管理員不可禁言）',
    },
  },
  {
    key: 'users.error.notFound',
    messages: {
      'en-US': 'The user does not exist',
      'zh-CN': '用户不存在',
      'zh-TW': '使用者不存在',
      'zh-HK': '使用者不存在',
    },
  },
  {
    key: 'users.error.resetMailTooFrequent',
    messages: {
      'en-US': 'Reset emails for this user are being sent too often. Please try again later.',
      'zh-CN': '该用户的重置邮件发送过于频繁，请稍后再试。',
      'zh-TW': '該使用者的重設郵件傳送過於頻繁，請稍後再試。',
      'zh-HK': '該使用者的重設郵件傳送過於頻繁，請稍後再試。',
    },
  },
]

describe('users messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
