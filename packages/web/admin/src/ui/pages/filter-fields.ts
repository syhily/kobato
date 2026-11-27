import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { I18nValue } from '@kobato/ui/lib/I18nProvider'
import type { FilterFieldSpec, FilterQueryPatch } from '@kobato/web-admin/ui/shared/filter-bar/types'

import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { deriveStatusQueryFields } from '@kobato/web-admin/ui/shared/filter-bar/status-fields'
import { ListChecksIcon, UserIcon } from 'lucide-react'

export type PageFilterFieldKey = 'status' | 'author'

export type PageStatusFilter = 'all' | 'published' | 'draft' | 'deleted'

export const PAGE_STATUS_OPTIONS: { value: string; labelId: UiMessageId }[] = [
  { value: 'published', labelId: 'admin.content.status.published' },
  { value: 'draft', labelId: 'admin.content.status.draft' },
  { value: 'deleted', labelId: 'admin.content.status.deleted' },
]

const PAGE_STATUS_FIELDS: Record<Exclude<PageStatusFilter, 'deleted'>, { published?: boolean }> = {
  all: {},
  published: { published: true },
  draft: { published: false },
}

export function deriveStatusFields(status: PageStatusFilter): {
  deletedStatus: 'all' | 'deleted' | 'normal'
  published?: boolean
} {
  return deriveStatusQueryFields(status, PAGE_STATUS_FIELDS)
}

export interface PagesFilterQuery {
  deletedStatus?: 'all' | 'deleted' | 'normal'
  published?: boolean
  authorId?: string
}

export function buildPageFilterFields(
  authors: readonly { id: string; name: string }[],
  t: I18nValue['t'],
): FilterFieldSpec<PageFilterFieldKey>[] {
  return [
    {
      key: 'status',
      label: t('admin.pages.filter.status'),
      icon: ListChecksIcon,
      kind: 'options',
      options: PAGE_STATUS_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelId) })),
      toQuery: (value) => unsafeCast<FilterQueryPatch>(deriveStatusFields(unsafeCast<PageStatusFilter>(value))),
    },
    {
      key: 'author',
      label: t('admin.pages.filter.author'),
      icon: UserIcon,
      kind: 'options',
      options: authors.map((u) => ({ value: u.id, label: u.name })),
      toQuery: (value) => ({ authorId: value }),
    },
  ]
}
