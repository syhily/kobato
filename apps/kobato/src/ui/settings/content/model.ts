import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { ContentSettings } from '@kobato/settings/types'

export interface ContentFormProps {
  content: ContentSettings
}

export const SORT_DIR_ITEMS = [
  { value: 'desc', labelId: 'admin.settings.content.sort.dir.desc' },
  { value: 'asc', labelId: 'admin.settings.content.sort.dir.asc' },
] as const satisfies readonly { value: 'asc' | 'desc'; labelId: UiMessageId }[]

export const SORT_BY_ITEMS = [
  { value: 'publishedAt', labelId: 'admin.settings.content.sort.by.publishedAt' },
  { value: 'updatedAt', labelId: 'admin.settings.content.sort.by.updatedAt' },
] as const satisfies readonly { value: 'publishedAt' | 'updatedAt'; labelId: UiMessageId }[]
