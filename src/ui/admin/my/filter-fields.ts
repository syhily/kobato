import { FileTextIcon, ListChecksIcon, SearchIcon } from 'lucide-react'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'
import type { FilterFieldSpec, FilterOptionItem } from '@/ui/admin/shared/filter-bar/types'
import type { I18nValue } from '@/ui/lib/I18nProvider'

import { orpcQuery } from '@/client/api/orpc-query'

// My-comments filter-pill specs. The URL is the source of truth — the
// `toQuery` mappers are inert; pill edits mirror back via controlled mode.
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
