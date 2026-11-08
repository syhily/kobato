import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Every migrated auth-flow message must exist, translated, in all four locales —
// the English fallback is only for logs and old clients, never what a reader sees.

interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const CASES: Case[] = [
  {
    key: 'auth.signin.error.invalidCredentials',
    messages: {
      'en-US': 'Incorrect email or password.',
      'zh-CN': '用户名或密码不正确。',
      'zh-TW': '使用者名稱或密碼不正確。',
      'zh-HK': '使用者名稱或密碼不正確。',
    },
  },
  {
    key: 'auth.signin.error.credentialsRequired',
    messages: {
      'en-US': 'Enter a valid email and password.',
      'zh-CN': '请填写正确的邮箱和密码。',
      'zh-TW': '請填寫正確的電子郵件與密碼。',
      'zh-HK': '請填寫正確的電子郵件與密碼。',
    },
  },
  {
    key: 'auth.signin.error.passkeyRequired',
    messages: {
      'en-US': 'This account uses Passkey sign-in. Please continue with Passkey.',
      'zh-CN': '该账户已选择 Passkey 登陆，请使用 Passkey 方式登陆。',
      'zh-TW': '此帳戶已選擇 Passkey 登入，請使用 Passkey 方式登入。',
      'zh-HK': '此帳戶已選擇 Passkey 登入，請使用 Passkey 方式登入。',
    },
  },
  {
    key: 'auth.signin.error.accountCannotSignIn',
    messages: {
      'en-US': 'The account state is invalid, so sign-in is unavailable.',
      'zh-CN': '账户状态异常，无法登录。',
      'zh-TW': '帳戶狀態異常，無法登入。',
      'zh-HK': '帳戶狀態異常，無法登入。',
    },
  },
  {
    key: 'auth.signin.magicLinkSent',
    messages: {
      'en-US': 'If that email is registered, a sign-in link is on its way. Check your inbox.',
      'zh-CN': '如果该邮箱已注册，登录链接已发送，请查收邮箱。',
      'zh-TW': '如果該電子郵件已註冊，登入連結已寄出，請查收信箱。',
      'zh-HK': '如果該電子郵件已註冊，登入連結已寄出，請查收信箱。',
    },
  },
  {
    key: 'auth.passwordReset.sent',
    messages: {
      'en-US': 'If that email exists and is eligible, a reset email has been sent.',
      'zh-CN': '如果该邮箱存在且符合要求，重置邮件已发送。',
      'zh-TW': '如果該電子郵件存在且符合資格，重設郵件已寄出。',
      'zh-HK': '如果該電子郵件存在且符合資格，重設郵件已寄出。',
    },
  },
  {
    key: 'auth.passwordReset.error.passwordTooShort',
    params: { min: 10 },
    messages: {
      'en-US': 'The password must be at least 10 characters.',
      'zh-CN': '密码长度至少 10 位。',
      'zh-TW': '密碼長度至少 10 位。',
      'zh-HK': '密碼長度至少 10 位。',
    },
  },
  {
    key: 'auth.passwordReset.error.passwordComplexity',
    messages: {
      'en-US': 'The password must contain at least one uppercase letter, one lowercase letter and one digit.',
      'zh-CN': '密码必须包含至少一个大写字母、一个小写字母和一个数字。',
      'zh-TW': '密碼必須包含至少一個大寫字母、一個小寫字母和一個數字。',
      'zh-HK': '密碼必須包含至少一個大寫字母、一個小寫字母和一個數字。',
    },
  },
  {
    key: 'auth.setup.error.adminExists',
    messages: {
      'en-US': 'An administrator account already exists. Sign in and continue setup.',
      'zh-CN': '管理员账号已存在，请直接登录后继续初始化。',
      'zh-TW': '管理員帳號已存在，請直接登入後繼續初始化。',
      'zh-HK': '管理員帳號已存在，請直接登入後繼續初始化。',
    },
  },
  {
    key: 'auth.passkey.error.disabled',
    messages: {
      'en-US': 'Passkey sign-in is not enabled.',
      'zh-CN': 'Passkey 登录未启用。',
      'zh-TW': 'Passkey 登入未啟用。',
      'zh-HK': 'Passkey 登入未啟用。',
    },
  },
  {
    key: 'auth.passkey.error.verifyFailed',
    messages: {
      'en-US': 'Passkey verification failed. Please try again.',
      'zh-CN': 'Passkey 验证失败，请重试。',
      'zh-TW': 'Passkey 驗證失敗，請重試。',
      'zh-HK': 'Passkey 驗證失敗，請重試。',
    },
  },
  {
    key: 'error.api.unauthorized',
    messages: {
      'en-US': 'Sign in to continue.',
      'zh-CN': '需要登录后再操作。',
      'zh-TW': '需要登入後再操作。',
      'zh-HK': '需要登入後再操作。',
    },
  },
  {
    key: 'error.api.insufficientPermissions',
    messages: {
      'en-US': 'Insufficient permissions',
      'zh-CN': '权限不足',
      'zh-TW': '權限不足',
      'zh-HK': '權限不足',
    },
  },
  {
    key: 'admin.settings.errors.unrecognizedKeys',
    params: { keys: 'bogus' },
    messages: {
      'en-US': 'Unrecognized keys: bogus',
      'zh-CN': '无法识别的字段：bogus',
      'zh-TW': '無法辨識的欄位：bogus',
      'zh-HK': '無法辨識的欄位：bogus',
    },
  },
  {
    key: 'admin.settings.assets.error.endpointHttps',
    messages: {
      'en-US': 'The endpoint must use HTTPS (a plaintext http:// URL would expose the access keys on the wire)',
      'zh-CN': 'Endpoint 必须使用 HTTPS（http:// 会在网络上明文传输访问密钥）',
      'zh-TW': 'Endpoint 必須使用 HTTPS（http:// 會在網路上明文傳輸存取金鑰）',
      'zh-HK': 'Endpoint 必須使用 HTTPS（http:// 會在網路上明文傳輸存取金鑰）',
    },
  },
  {
    key: 'auth.sessions.error.forbiddenRevoke',
    messages: {
      'en-US': "You are not allowed to revoke another administrator's session.",
      'zh-CN': '无权撤销其他管理员的会话。',
      'zh-TW': '無權撤銷其他管理員的工作階段。',
      'zh-HK': '無權撤銷其他管理員的工作階段。',
    },
  },
]

describe('auth flow and perimeter messages — four-locale parity', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    const descriptor = descriptorFor(key, params)
    expect(descriptor.messageKey).toBe(key)
    expect(descriptor.fallbackMessage).toBe(createServerTranslator('en-US').format(key, params))
    expect(descriptor.fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
