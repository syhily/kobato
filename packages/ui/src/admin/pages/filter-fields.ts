import type { FilterFieldSpec, FilterQueryPatch } from '@kobato/ui/admin/shared/filter-bar/types'

import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { deriveStatusQueryFields } from '@kobato/ui/admin/shared/filter-bar/status-fields'
import { ListChecksIcon, UserIcon } from 'lucide-react'

// Pages-list filter-pill field specs — keys, labels, icons, the status
// option array, and the `toQuery` mappers onto `admin.pages.list`'s input.
// `buildPageFilterFields` is a factory (memoized by the view) because the
// author options come from an async option-list query.

export type PageFilterFieldKey = 'status' | 'author'

export type PageStatusFilter = 'all' | 'published' | 'draft' | 'deleted'

export const PAGE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'deleted', label: '已删除' },
]

// The pages leg set — no `visible` leg: the page table has no `visible`
// column, so a status maps onto the published flag only.
const PAGE_STATUS_FIELDS: Record<Exclude<PageStatusFilter, 'deleted'>, { published?: boolean }> = {
  all: {},
  published: { published: true },
  draft: { published: false },
}

/** Map the status filter onto the list API's deleted/published flags. */
export function deriveStatusFields(status: PageStatusFilter): {
  deletedStatus: 'all' | 'deleted' | 'normal'
  published?: boolean
} {
  return deriveStatusQueryFields(status, PAGE_STATUS_FIELDS)
}

/** The `admin.pages.list` input contributed by the active pills. */
export interface PagesFilterQuery {
  deletedStatus?: 'all' | 'deleted' | 'normal'
  published?: boolean
  authorId?: string
}

export function buildPageFilterFields(
  authors: readonly { id: string; name: string }[],
): FilterFieldSpec<PageFilterFieldKey>[] {
  return [
    {
      key: 'status',
      label: '状态',
      icon: ListChecksIcon,
      kind: 'options',
      options: PAGE_STATUS_OPTIONS,
      // The status projection carries a boolean; the string-typed patch is
      // the common case and the merge copies values verbatim, so the cast
      // is exact.
      toQuery: (value) => unsafeCast<FilterQueryPatch>(deriveStatusFields(unsafeCast<PageStatusFilter>(value))),
    },
    {
      key: 'author',
      label: '作者',
      icon: UserIcon,
      kind: 'options',
      options: authors.map((u) => ({ value: u.id, label: u.name })),
      toQuery: (value) => ({ authorId: value }),
    },
  ]
}
