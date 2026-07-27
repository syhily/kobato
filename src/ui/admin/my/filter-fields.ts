import { FileTextIcon, ListChecksIcon, SearchIcon } from 'lucide-react'

import type { FilterFieldSpec, FilterOptionItem } from '@/ui/admin/shared/filter-bar/types'

import { orpcQuery } from '@/client/api/orpc-query'

// My-comments filter-pill field specs. The URL is the source of truth for
// this view, so the `toQuery` mappers are intentionally inert — the list
// input is built from the loader props directly, and `useFilterPills`'s
// controlled mode mirrors pill edits back into the URL.
//
// `buildMyCommentFilterFields` is a factory (memoized by the view) because
// the entity picker's idle items come from the loader's `entityOptions`.

export type MyCommentFilterFieldKey = 'status' | 'page' | 'text'

export const MY_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: '待审' },
  { value: 'deleteRequested', label: '申请删除' },
  { value: 'deleted', label: '已删除' },
]

export const MY_TEXT_FILTER_OPERATORS: readonly { value: string; label: string }[] = [
  { value: 'contains', label: '包含' },
] as const

interface SearchMineEntitiesData {
  entities: { value: string; label: string }[]
}

export function buildMyCommentFilterFields(
  entityOptions: readonly FilterOptionItem[],
): FilterFieldSpec<MyCommentFilterFieldKey>[] {
  return [
    {
      key: 'status',
      label: '状态',
      icon: ListChecksIcon,
      kind: 'options',
      options: MY_STATUS_OPTIONS,
      toQuery: () => ({}),
    },
    {
      key: 'page',
      label: '文章',
      icon: FileTextIcon,
      kind: 'search',
      queryOptions: (query) =>
        orpcQuery.comments.searchMineEntities.queryOptions({
          input: query ? { q: query } : {},
          enabled: query !== '',
        }),
      select: (data: SearchMineEntitiesData) => data.entities.map((e) => ({ value: e.value, label: e.label })),
      initialItems: entityOptions,
      placeholder: '全部文章',
      inputPlaceholder: '搜索文章…',
      emptyMessage: '无匹配文章',
      toQuery: () => ({}),
    },
    {
      key: 'text',
      label: '内容',
      icon: SearchIcon,
      kind: 'text',
      operators: MY_TEXT_FILTER_OPERATORS,
      toQuery: () => ({}),
    },
  ]
}
