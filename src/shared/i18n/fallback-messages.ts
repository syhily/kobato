// The ONE message module the client may value-import synchronously: the root
// ErrorBoundary's minimal chrome AND the no-payload meta fallbacks (pre-install
// title, page article:section) for when the root loader failed.
//
// The strings are deliberately duplicated rather than derived from
// `messages/ui/zh-CN.ts` — importing that catalog here would drag the whole corpus
// into the client graph. Parity is pinned by
// `tests/unit/shared/i18n/fallback-messages.test.ts`.

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

export const FALLBACK_MESSAGE_IDS = [
  'common.action.reload',
  'error.boundary.description',
  'error.boundary.title',
  'meta.preinstall',
  'meta.section.page',
] as const satisfies readonly UiMessageId[]

export type FallbackMessageId = (typeof FALLBACK_MESSAGE_IDS)[number]

export type FallbackMessages = Record<FallbackMessageId, string>

/**
 * Simplified Chinese: the only language that can be assumed before the settings
 * row has ever been read.
 */
export const fallbackMessages: FallbackMessages = {
  'common.action.reload': '刷新',
  'error.boundary.description': '抱歉，网站系统出现内部错误。请刷新页面重试。',
  'error.boundary.title': '内部错误',
  'meta.preinstall': '正在安装',
  'meta.section.page': '页面',
}
