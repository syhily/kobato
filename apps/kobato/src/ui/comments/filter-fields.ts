import type { AdminCommentStatus, CommentTextMatch } from '@kobato/api/contracts/admin/comments'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { I18nValue } from '@kobato/ui/lib/I18nProvider'

import { orpcQuery } from '@kobato/api/browser/orpc-query'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { CalendarIcon, FileTextIcon, ListChecksIcon, SearchIcon, UserIcon } from 'lucide-react'

import type { FilterFieldSpec } from '@/ui/shared/filter-bar/types'

import { resolveSingleDateFilterBounds } from '@/ui/shared/filter-bar/date-filter'
import { parseTextFilterValue, textFilterValueLabel } from '@/ui/shared/filter-bar/text-filter'

export type CommentFilterFieldKey = 'status' | 'page' | 'author' | 'text' | 'date'

export type TextFilterOperator = CommentTextMatch

export const TEXT_FILTER_OPERATORS = [
  { value: 'contains', labelId: 'admin.comments.filter.contains' },
  { value: 'does-not-contain', labelId: 'admin.comments.filter.doesNotContain' },
] as const satisfies readonly { value: CommentTextMatch; labelId: UiMessageId }[]

export const DEFAULT_TEXT_OPERATOR: TextFilterOperator = 'contains'

export function isTextFilterOperator(value: unknown): value is TextFilterOperator {
  return TEXT_FILTER_OPERATORS.some((operator) => operator.value === value)
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

export const STATUS_OPTIONS = [
  { value: 'pending', labelId: 'admin.comments.filter.status.pending' },
  { value: 'approved', labelId: 'admin.comments.filter.status.approved' },
  { value: 'deleteRequested', labelId: 'admin.comments.filter.status.deleteRequested' },
] as const satisfies readonly { value: Exclude<AdminCommentStatus, 'all'>; labelId: UiMessageId }[]

export interface CommentsFilterQuery {
  pageKey?: string
  userId?: string
  status?: Exclude<AdminCommentStatus, 'all'>
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
