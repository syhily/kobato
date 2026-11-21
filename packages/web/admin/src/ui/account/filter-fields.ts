import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { I18nValue } from '@kobato/ui/lib/I18nProvider'
import type { FilterFieldSpec, FilterOptionItem } from '@kobato/web-admin/ui/shared/filter-bar/types'

import { orpcQuery } from '@kobato/web-client/api/orpc-query'
import { FileTextIcon, ListChecksIcon, SearchIcon } from 'lucide-react'

export type MyCommentFilterFieldKey = 'status' | 'page' | 'text'

export const MY_STATUS_OPTIONS: { value: string; labelId: UiMessageId }[] = [
  { value: 'pending', labelId: 'admin.my.filter.status.pending' },
  { value: 'deleteRequested', labelId: 'admin.my.filter.status.deleteRequested' },
  { value: 'deleted', labelId: 'admin.my.filter.status.deleted' },
]

export const MY_TEXT_FILTER_OPERATORS: readonly { value: string; labelId: UiMessageId }[] = [
  { value: 'contains', labelId: 'admin.my.filter.contains' },
] as const

interface SearchMineEntitiesData {
  entities: { value: string; label: string }[]
}

export function buildMyCommentFilterFields(
  entityOptions: readonly FilterOptionItem[],
  t: I18nValue['t'],
): FilterFieldSpec<MyCommentFilterFieldKey>[] {
  return [
    {
      key: 'status',
      label: t('admin.my.filter.status'),
      icon: ListChecksIcon,
      kind: 'options',
      options: MY_STATUS_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelId) })),
      toQuery: () => ({}),
    },
    {
      key: 'page',
      label: t('admin.my.filter.page'),
      icon: FileTextIcon,
      kind: 'search',
      queryOptions: (query) =>
        orpcQuery.comments.searchMineEntities.queryOptions({
          input: query ? { q: query } : {},
          enabled: query !== '',
        }),
      select: (data: SearchMineEntitiesData) => data.entities.map((e) => ({ value: e.value, label: e.label })),
      initialItems: entityOptions,
      placeholder: t('admin.my.filter.allPages'),
      inputPlaceholder: t('admin.my.filter.searchPages'),
      emptyMessage: t('admin.my.filter.noPages'),
      toQuery: () => ({}),
    },
    {
      key: 'text',
      label: t('admin.my.filter.text'),
      icon: SearchIcon,
      kind: 'text',
      inputAria: t('admin.my.filter.searchTextAria'),
      inputPlaceholder: t('admin.my.filter.searchTextPlaceholder'),
      operators: MY_TEXT_FILTER_OPERATORS.map((operator) => ({
        value: operator.value,
        label: t(operator.labelId),
      })),
      toQuery: () => ({}),
    },
  ]
}
