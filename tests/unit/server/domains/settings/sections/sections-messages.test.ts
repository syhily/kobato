import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// The remaining settings sections' custom validation copy (comments, socials,
// cache, backup, sidebar, mail, fonts, observability): typed ids, four locales, parameterized
// where the bound/identifier matters.
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const CASES: Case[] = [
  {
    key: 'admin.settings.comments.error.mirrorInvalid',
    messages: {
      'en-US': 'The mirror must be a known Gravatar mirror HTTPS URL',
      'zh-CN': '镜像地址必须是已知的 Gravatar 镜像 HTTPS URL',
      'zh-TW': '鏡像位址必須是已知的 Gravatar 鏡像 HTTPS URL',
      'zh-HK': '鏡像位址必須是已知的 Gravatar 鏡像 HTTPS URL',
    },
  },
  {
    key: 'admin.settings.comments.error.duplicateSource',
    messages: {
      'en-US': 'Avatar sources cannot repeat',
      'zh-CN': '头像来源不能重复',
      'zh-TW': '頭像來源不能重複',
      'zh-HK': '頭像來源不能重複',
    },
  },
  {
    key: 'admin.settings.socials.error.fixedType',
    params: { network: 'GitHub', type: 'link' },
    messages: {
      'en-US': 'GitHub always uses the `link` display mode',
      'zh-CN': '「GitHub」固定使用 `link` 展示方式',
      'zh-TW': '「GitHub」固定使用 `link` 顯示方式',
      'zh-HK': '「GitHub」固定使用 `link` 顯示方式',
    },
  },
  {
    key: 'admin.settings.socials.error.duplicateNetwork',
    params: { network: 'GitHub' },
    messages: {
      'en-US': 'GitHub has already been added. Edit the existing row instead.',
      'zh-CN': '「GitHub」已经添加过，请直接编辑已有那条',
      'zh-TW': '「GitHub」已經新增過，請直接編輯既有那條',
      'zh-HK': '「GitHub」已經新增過，請直接編輯既有那條',
    },
  },
  {
    key: 'admin.settings.cache.error.prefixFormat',
    messages: {
      'en-US': 'The prefix may only contain letters / digits / `_` / `-` and must end with `:`',
      'zh-CN': '前缀只能包含字母 / 数字 / `_` / `-`，且必须以 `:` 结尾',
      'zh-TW': '前綴只能包含字母 / 數字 / `_` / `-`，且必須以 `:` 結尾',
      'zh-HK': '前綴只能包含字母 / 數字 / `_` / `-`，且必須以 `:` 結尾',
    },
  },
  {
    key: 'admin.settings.cache.error.prefixOverlap',
    params: { right: 'posts', rightPrefix: 'post:', left: 'pages', leftPrefix: 'page:' },
    messages: {
      'en-US': 'The `post:` prefix of posts conflicts with `page:` of pages; prefix scans would hit each other',
      'zh-CN': '「posts」的前缀 `post:` 与「pages」的前缀 `page:` 冲突，会让前缀扫描互相误伤',
      'zh-TW': '「posts」的前綴 `post:` 與「pages」的前綴 `page:` 衝突，會讓前綴掃描互相誤傷',
      'zh-HK': '「posts」的前綴 `post:` 與「pages」的前綴 `page:` 衝突，會讓前綴掃描互相誤傷',
    },
  },
  {
    key: 'admin.settings.cache.error.reservedPrefix',
    params: { prefix: 'session:x', reserved: 'session:' },
    messages: {
      'en-US':
        '`session:x` conflicts with the reserved prefix `session:` (session / rate-limit / fixed caches cannot be cleared from the admin panel)',
      'zh-CN': '`session:x` 与系统保留前缀 `session:` 冲突（session / rate-limit / 固定缓存不可被管理面板清空）',
      'zh-TW': '`session:x` 與系統保留前綴 `session:` 衝突（session / rate-limit / 固定快取不可被管理面板清空）',
      'zh-HK': '`session:x` 與系統保留前綴 `session:` 衝突（session / rate-limit / 固定快取不可被管理面板清空）',
    },
  },
  {
    key: 'admin.settings.backup.error.dayOfWeekRequired',
    messages: {
      'en-US': 'Choose a weekday',
      'zh-CN': '请选择星期几',
      'zh-TW': '請選擇星期幾',
      'zh-HK': '請選擇星期幾',
    },
  },
  {
    key: 'admin.settings.backup.error.dayOfMonthRequired',
    messages: {
      'en-US': 'Choose a day of the month',
      'zh-CN': '请选择每月日期',
      'zh-TW': '請選擇每月日期',
      'zh-HK': '請選擇每月日期',
    },
  },
  {
    key: 'admin.settings.backup.error.encryptionPasswordRequired',
    messages: {
      'en-US': 'Set a password before enabling backup encryption',
      'zh-CN': '启用备份加密需要设置密码',
      'zh-TW': '啟用備份加密需要設定密碼',
      'zh-HK': '啟用備份加密需要設定密碼',
    },
  },
  {
    key: 'admin.settings.backup.error.encryptionPasswordTooShort',
    params: { min: 8 },
    messages: {
      'en-US': 'The backup encryption password must be at least 8 characters',
      'zh-CN': '备份加密密码至少 8 位',
      'zh-TW': '備份加密密碼至少 8 位',
      'zh-HK': '備份加密密碼至少 8 位',
    },
  },
  {
    key: 'admin.settings.sidebar.error.customQuotesTooFew',
    params: { min: 10 },
    messages: {
      'en-US': 'Custom quotes need at least 10 entries, or clear them to use the built-in bank',
      'zh-CN': '自定义一言至少需要 10 条，或清空后使用内置一言库',
      'zh-TW': '自訂一言至少需要 10 條，或清空後使用內建一言庫',
      'zh-HK': '自訂一言至少需要 10 條，或清空後使用內建一言庫',
    },
  },
  {
    key: 'admin.settings.mail.error.hostnameInvalid',
    messages: {
      'en-US': 'Enter a hostname or domain (letters / digits / `-` / `.` only); no scheme, port, path or IP address',
      'zh-CN': '请填写主机名或域名（只能包含字母 / 数字 / `-` / `.`），不能带协议、端口、路径或 IP 地址',
      'zh-TW': '請填寫主機名稱或網域（只能包含字母 / 數字 / `-` / `.`），不能帶通訊協定、連接埠、路徑或 IP 位址',
      'zh-HK': '請填寫主機名稱或網域（只能包含字母 / 數字 / `-` / `.`），不能帶通訊協定、連接埠、路徑或 IP 位址',
    },
  },
  {
    key: 'admin.settings.observability.error.endpointInvalid',
    messages: {
      'en-US':
        'Enter the OpenObserve origin only (for example https://obs.example.com) — no path, query string or credentials',
      'zh-CN': '只需填写 OpenObserve 的源地址（例如 https://obs.example.com），不要包含路径、查询参数或账号密码',
      'zh-TW': '只需填寫 OpenObserve 的來源位址（例如 https://obs.example.com），不要包含路徑、查詢參數或帳號密碼',
      'zh-HK': '只需填寫 OpenObserve 的來源位址（例如 https://obs.example.com），不要包含路徑、查詢參數或帳號密碼',
    },
  },
  {
    key: 'admin.settings.observability.error.endpointHttps',
    messages: {
      'en-US': 'A remote OpenObserve endpoint must use HTTPS; plain HTTP is only allowed for loopback addresses',
      'zh-CN': '远程 OpenObserve 地址必须使用 HTTPS；仅回环地址允许明文 HTTP',
      'zh-TW': '遠端 OpenObserve 位址必須使用 HTTPS；僅回送位址允許明文 HTTP',
      'zh-HK': '遠端 OpenObserve 位址必須使用 HTTPS；僅回送位址允許明文 HTTP',
    },
  },
  {
    key: 'admin.settings.observability.error.organizationInvalid',
    messages: {
      'en-US': 'The site name must be 1–64 letters, digits, `_` or `-`, starting with a letter or digit',
      'zh-CN': '站点名称需为 1–64 位字母、数字、`_` 或 `-`，且以字母或数字开头',
      'zh-TW': '站台名稱需為 1–64 位字母、數字、`_` 或 `-`，且以字母或數字開頭',
      'zh-HK': '網站名稱需為 1–64 位字母、數字、`_` 或 `-`，且以字母或數字開頭',
    },
  },
  {
    key: 'admin.settings.fonts.error.familyInvalid',
    messages: {
      'en-US': 'font-family must not contain quotes, backslashes, or braces',
      'zh-CN': 'font-family 不能包含引号、反斜杠或花括号',
      'zh-TW': 'font-family 不能包含引號、反斜線或大括號',
      'zh-HK': 'font-family 不能包含引號、反斜線或大括號',
    },
  },
]

describe('settings section messages — four locales', () => {
  it.each(CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
