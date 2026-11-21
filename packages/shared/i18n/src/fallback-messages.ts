import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

export const FALLBACK_MESSAGE_IDS = [
  'common.action.reload',
  'error.boundary.description',
  'error.boundary.title',
  'meta.preinstall',
  'meta.section.page',
] as const satisfies readonly UiMessageId[]

export type FallbackMessageId = (typeof FALLBACK_MESSAGE_IDS)[number]

export type FallbackMessages = Record<FallbackMessageId, string>

export const fallbackMessages: FallbackMessages = {
  'common.action.reload': '刷新',
  'error.boundary.description': '抱歉，网站系统出现内部错误。请刷新页面重试。',
  'error.boundary.title': '内部错误',
  'meta.preinstall': '正在安装',
  'meta.section.page': '页面',
}
