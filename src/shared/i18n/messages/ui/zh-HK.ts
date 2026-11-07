import type { UiMessages } from '@/shared/i18n/messages/ui/en-US'

// Hong Kong Traditional Chinese — written and reviewed on its own, never
// produced by converting the Simplified catalog.
export const uiMessagesZhHK = {
  'common.action.back': '返回',
  'common.action.cancel': '取消',
  'common.action.close': '關閉',
  'common.action.confirm': '確認',
  'common.action.delete': '刪除',
  'common.action.edit': '編輯',
  'common.action.reload': '重新載入',
  'common.action.retry': '重試',
  'common.action.save': '儲存',
  'common.action.search': '搜尋',
  'common.count.items': '{count, plural, other {# 項}}',
  'common.state.loading': '載入中…',
  'error.boundary.description': '抱歉，網站系統發生內部錯誤。請重新載入頁面再試。',
  'error.boundary.title': '內部錯誤',
  'error.notFound.description': '抱歉，找不到你要的內容…',
  'error.notFound.title': '找不到頁面',
  'validation.form.invalidEmail': '請輸入有效的電郵地址。',
  'validation.form.invalidUrl': '請輸入完整的 URL（包含 https://）。',
  'validation.form.maxLength': '最多 {max} 個字元。',
  'validation.form.minLength': '至少 {min} 個字元。',
  'validation.form.required': '請填寫此項。',
} satisfies UiMessages
