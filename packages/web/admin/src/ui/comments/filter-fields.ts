import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'
import type { I18nValue } from '@kobato/ui/lib/I18nProvider.tsx'
import type { FilterFieldSpec } from '@kobato/web-admin/ui/shared/filter-bar/types.ts'

import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { resolveSingleDateFilterBounds } from '@kobato/web-admin/ui/shared/filter-bar/date-filter.ts'
import { parseTextFilterValue, textFilterValueLabel } from '@kobato/web-admin/ui/shared/filter-bar/text-filter.ts'
import { orpcQuery } from '@kobato/web-client/api/orpc-query.ts'
import { CalendarIcon, FileTextIcon, ListChecksIcon, SearchIcon, UserIcon } from 'lucide-react'

export type CommentFilterFieldKey = 'status' | 'page' | 'author' | 'text' | 'date'

export type TextFilterOperator = 'contains' | 'does-not-contain'

export const TEXT_FILTER_OPERATORS: readonly { value: TextFilterOperator; labelId: UiMessageId }[] = [
  { value: 'contains', labelId: 'admin.comments.filter.contains' },
  { value: 'does-not-contain', labelId: 'admin.comments.filter.doesNotContain' },
] as const

export const DEFAULT_TEXT_OPERATOR: TextFilterOperator = 'contains'

export function isTextFilterOperator(value: unknown): value is TextFilterOperator {
  return value === 'contains' || value === 'does-not-contain'
}

export interface TextFilterValue {
  op: TextFilterOperator
  value: string
}

export function parseTextFilter(value: string | undefined): TextFilterValue | null {
  const parsed = parseTextFilterValue(value, TEXT_FILTER_OPERATORS)
  return parsed ? { op: unsafeCast<TextFilterOperator>(parsed.op), value: parsed.value } : null
}

export function textFilterLabel(v: TextFilterValue, t: I18nValue['t']): string {
  return textFilterValueLabel(
    v,
    TEXT_FILTER_OPERATORS.map((operator) => ({ value: operator.value, label: t(operator.labelId) })),
    t,
  )
}

export const STATUS_OPTIONS: { value: string; labelId: UiMessageId }[] = [
  { value: 'pending', labelId: 'admin.comments.filter.status.pending' },
  { value: 'approved', labelId: 'admin.comments.filter.status.approved' },
  { value: 'deleteRequested', labelId: 'admin.comments.filter.status.deleteRequested' },
]

export interface CommentsFilterQuery {
  pageKey?: string
  userId?: string
  status?: 'pending' | 'approved' | 'deleteRequested'
  q?: string
  match?: TextFilterOperator
  createdAfter?: string
  createdBefore?: string
}

interface SearchPagesData {
  pages: { key: string; title: string | null }[]
}

interface SearchAuthorsData {
  authors: { id: string; name: string }[]
}

export function buildCommentFilterFields(t: I18nValue['t']): FilterFieldSpec<CommentFilterFieldKey>[] {
  return [
    {
      key: 'status',
      label: t('admin.comments.filter.status'),
      icon: ListChecksIcon,
      kind: 'options',
      options: STATUS_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelId) })),
      toQuery: (value) => (value === 'all' ? {} : { status: value }),
    },
    {
      key: 'page',
      label: t('admin.comments.filter.page'),
      icon: FileTextIcon,
      kind: 'search',
      queryOptions: (query) =>
        orpcQuery.admin.comments.searchPages.queryOptions({
          input: query ? { q: query } : {},
        }),
      select: (data: SearchPagesData) =>
        data.pages.map((p) => ({ value: p.key, label: p.title || t('admin.comments.filter.noTitle') })),
      resolveOptions: (value) =>
        orpcQuery.admin.comments.searchPages.queryOptions({
          input: { key: value },
        }),
      placeholder: t('admin.comments.filter.allPages'),
      inputPlaceholder: t('admin.comments.filter.searchPages'),
      emptyMessage: t('admin.comments.filter.noPages'),
      toQuery: (value) => (value ? { pageKey: value } : {}),
    },
    {
      key: 'author',
      label: t('admin.comments.filter.author'),
      icon: UserIcon,
      kind: 'search',
      queryOptions: (query) =>
        orpcQuery.admin.comments.searchAuthors.queryOptions({
          input: query ? { q: query } : {},
        }),
      select: (data: SearchAuthorsData) => data.authors.map((a) => ({ value: a.id, label: a.name })),
      resolveOptions: (value) =>
        orpcQuery.admin.comments.searchAuthors.queryOptions({
          input: { ids: value },
        }),
      placeholder: t('admin.comments.filter.allAuthors'),
      inputPlaceholder: t('admin.comments.filter.searchAuthors'),
      emptyMessage: t('admin.comments.filter.noAuthors'),
      toQuery: (value) => (value ? { userId: value } : {}),
    },
    {
      key: 'text',
      label: t('admin.comments.filter.text'),
      icon: SearchIcon,
      kind: 'text',
      inputAria: t('admin.comments.filter.searchTextAria'),
      inputPlaceholder: t('admin.comments.filter.searchTextPlaceholder'),
      operators: TEXT_FILTER_OPERATORS.map((operator) => ({
        value: operator.value,
        label: t(operator.labelId),
      })),
      toQuery: ({ op, value }) => (value ? { q: value, match: unsafeCast<TextFilterOperator>(op) } : {}),
    },
    {
      key: 'date',
      label: t('admin.comments.filter.date'),
      icon: CalendarIcon,
      kind: 'date-single',
      toQuery: (value) => {
        const bounds = resolveSingleDateFilterBounds(value)
        return {
          ...(bounds.after ? { createdAfter: bounds.after } : {}),
          ...(bounds.before ? { createdBefore: bounds.before } : {}),
        }
      },
    },
  ]
}
