import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'
import type { CustomQuote, DailyQuoteSource, SidebarWidgetType } from '@kobato/settings/types.ts'

import { isRecord } from '@kobato/utils/type-guards.ts'

export const WIDGET_LABEL_IDS = {
  search: 'admin.settings.sidebar.widget.search.label',
  recentPosts: 'admin.settings.sidebar.widget.recentPosts.label',
  recentComments: 'admin.settings.sidebar.widget.recentComments.label',
  randomTags: 'admin.settings.sidebar.widget.randomTags.label',
  todayCalendar: 'admin.settings.sidebar.widget.todayCalendar.label',
} as const satisfies Record<SidebarWidgetType, UiMessageId>

export const WIDGET_HINT_IDS = {
  search: 'admin.settings.sidebar.widget.search.hint',
  recentPosts: 'admin.settings.sidebar.widget.recentPosts.hint',
  recentComments: 'admin.settings.sidebar.widget.recentComments.hint',
  randomTags: 'admin.settings.sidebar.widget.randomTags.hint',
  todayCalendar: 'admin.settings.sidebar.widget.todayCalendar.hint',
} as const satisfies Record<SidebarWidgetType, UiMessageId>

export const SOURCE_OPTIONS = [
  { value: 'shanbay', labelId: 'admin.settings.sidebar.quote.source.shanbay' },
  { value: 'one', labelId: 'admin.settings.sidebar.quote.source.one' },
  { value: 'hitokoto', labelId: 'admin.settings.sidebar.quote.source.hitokoto' },
  { value: 'custom', labelId: 'admin.settings.sidebar.quote.source.custom' },
  { value: 'local', labelId: 'admin.settings.sidebar.quote.source.local' },
] as const satisfies readonly { value: DailyQuoteSource; labelId: UiMessageId }[]

export const MIN_CUSTOM_QUOTES = 10
export const MAX_CUSTOM_QUOTES = 500

export interface DailyQuoteState {
  source: DailyQuoteSource
  customQuotes: CustomQuote[]
}

export function isQuoteRow(value: unknown): value is { content: string; author?: unknown } {
  return isRecord(value) && typeof value.content === 'string' && value.content.trim().length > 0
}
