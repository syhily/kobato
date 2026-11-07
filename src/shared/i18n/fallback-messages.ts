// The ONE message module the client may value-import synchronously: the root
// ErrorBoundary's minimal chrome for the case where the root loader failed and
// no i18n payload exists. Its strings are deliberately duplicated rather than
// derived from `messages/ui/zh-CN.ts` — importing that catalog here would drag
// the whole corpus into the client graph. Parity with the zh-CN catalog is
// pinned by tests/unit/shared/i18n/fallback-messages.test.ts.

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

export const FALLBACK_MESSAGE_IDS = [
  'common.action.reload',
  'error.boundary.description',
  'error.boundary.title',
] as const satisfies readonly UiMessageId[]

export type FallbackMessageId = (typeof FALLBACK_MESSAGE_IDS)[number]

export type FallbackMessages = Record<FallbackMessageId, string>

/**
 * Simplified Chinese: the pre-i18n default, and the only language that can be
 * assumed before the settings row has ever been read.
 */
export const fallbackMessages: FallbackMessages = {
  'common.action.reload': '刷新',
  'error.boundary.description': '抱歉，网站系统出现内部错误。请刷新页面重试。',
  'error.boundary.title': '内部错误',
}
