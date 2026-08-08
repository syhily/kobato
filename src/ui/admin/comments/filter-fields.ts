import { CalendarIcon, FileTextIcon, ListChecksIcon, SearchIcon, UserIcon } from 'lucide-react'

import type { FilterFieldSpec } from '@/ui/admin/shared/filter-bar/types'

import { orpcQuery } from '@/client/api/orpc-query'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { resolveSingleDateFilterBounds } from '@/ui/admin/shared/date-filter'
import { parseTextFilterValue, textFilterValueLabel } from '@/ui/admin/shared/filter-bar/text-filter'

// Filter-pill specs for the comments list, plus the 包含/不包含 text codec that specializes the shared codec.
export type CommentFilterFieldKey = 'status' | 'page' | 'author' | 'text' | 'date'

export type TextFilterOperator = 'contains' | 'does-not-contain'

export const TEXT_FILTER_OPERATORS: readonly { value: TextFilterOperator; label: string }[] = [
  { value: 'contains', label: '包含' },
  { value: 'does-not-contain', label: '不包含' },
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
  // The generic parse already validated `op` against TEXT_FILTER_OPERATORS — the narrowing cast is exact.
  return parsed ? { op: unsafeCast<TextFilterOperator>(parsed.op), value: parsed.value } : null
}

export function textFilterLabel(v: TextFilterValue): string {
  return textFilterValueLabel(v, TEXT_FILTER_OPERATORS)
}

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已审核' },
  { value: 'deleteRequested', label: '申请删除' },
]

/** The `admin.comments.loadAll` input contributed by the active pills. */
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

export const COMMENT_FILTER_FIELDS: FilterFieldSpec<CommentFilterFieldKey>[] = [
  {
    key: 'status',
    label: '状态',
    icon: ListChecksIcon,
    kind: 'options',
    options: STATUS_OPTIONS,
    toQuery: (value) => (value === 'all' ? {} : { status: value }),
  },
  {
    key: 'page',
    label: '文章',
    icon: FileTextIcon,
    kind: 'search',
    queryOptions: (query) =>
      orpcQuery.admin.comments.searchPages.queryOptions({
        input: query ? { q: query } : {},
      }),
    select: (data: SearchPagesData) => data.pages.map((p) => ({ value: p.key, label: p.title || '无标题' })),
    resolveOptions: (value) =>
      orpcQuery.admin.comments.searchPages.queryOptions({
        input: { key: value },
      }),
    placeholder: '全部文章',
    inputPlaceholder: '搜索文章…',
    emptyMessage: '无匹配文章',
    toQuery: (value) => (value ? { pageKey: value } : {}),
  },
  {
    key: 'author',
    label: '评论人',
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
    placeholder: '全部人员',
    inputPlaceholder: '搜索人员…',
    emptyMessage: '无匹配人员',
    toQuery: (value) => (value ? { userId: value } : {}),
  },
  {
    key: 'text',
    label: '内容',
    icon: SearchIcon,
    kind: 'text',
    operators: TEXT_FILTER_OPERATORS,
    toQuery: ({ op, value }) => (value ? { q: value, match: unsafeCast<TextFilterOperator>(op) } : {}),
  },
  {
    key: 'date',
    label: '时间',
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
