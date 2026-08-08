import { FolderIcon, ListChecksIcon, TagsIcon, UserIcon } from 'lucide-react'

import type { FilterFieldSpec, FilterQueryPatch } from '@/ui/admin/shared/filter-bar/types'
import type { ActiveFilter, FilterPillsAction } from '@/ui/admin/shared/filterPillsReducer'

import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { deriveStatusQueryFields } from '@/ui/admin/shared/filter-bar/status-fields'

// Posts-list filter-pill specs, URL seed/sync helpers, and `toQuery` mappers onto `admin.posts.list` input.
export type PostFilterFieldKey = 'status' | 'category' | 'tag' | 'author'

export type PostStatusFilter = 'all' | 'published' | 'draft' | 'unlisted' | 'deleted'

export const POST_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'unlisted', label: '不列出' },
  { value: 'deleted', label: '已删除' },
]

// The posts leg set — includes the `visible` leg that pages lack (no `visible` column on pages).
const POST_STATUS_FIELDS: Record<Exclude<PostStatusFilter, 'deleted'>, { published?: boolean; visible?: boolean }> = {
  all: {},
  published: { published: true, visible: true },
  draft: { published: false },
  unlisted: { published: true, visible: false },
}

/** Map the status filter onto the list API's deleted/published/visible flags. */
export function deriveStatusFields(status: PostStatusFilter): {
  deletedStatus: 'all' | 'deleted' | 'normal'
  published?: boolean
  visible?: boolean
} {
  return deriveStatusQueryFields(status, POST_STATUS_FIELDS)
}

/** The `admin.posts.list` input contributed by the active pills. */
export interface PostsFilterQuery {
  deletedStatus?: 'all' | 'deleted' | 'normal'
  published?: boolean
  visible?: boolean
  categoryId?: string
  tag?: string
  authorId?: string
}

/** Async option-list sources the factory closes over. */
export interface PostFilterFieldSources {
  categories: readonly { id: string; name: string }[]
  tags: readonly string[]
  authors: readonly { id: string; name: string }[]
}

export function buildPostFilterFields({
  categories,
  tags,
  authors,
}: PostFilterFieldSources): FilterFieldSpec<PostFilterFieldKey>[] {
  return [
    {
      key: 'status',
      label: '状态',
      icon: ListChecksIcon,
      kind: 'options',
      options: POST_STATUS_OPTIONS,
      // The status projection carries booleans; the string-typed patch is the common case and merges verbatim — the cast is exact.
      toQuery: (value) => unsafeCast<FilterQueryPatch>(deriveStatusFields(unsafeCast<PostStatusFilter>(value))),
    },
    {
      key: 'category',
      label: '分类',
      icon: FolderIcon,
      kind: 'options',
      options: categories.map((c) => ({ value: c.id, label: c.name })),
      toQuery: (value) => ({ categoryId: value }),
    },
    {
      key: 'tag',
      label: '标签',
      icon: TagsIcon,
      kind: 'options',
      options: tags.map((name) => ({ value: name, label: name })),
      searchable: true,
      searchPlaceholder: '搜索标签…',
      searchEmptyMessage: '无匹配标签',
      toQuery: (value) => ({ tag: value }),
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

// URL-backed fields in seed order — the author pill is UI-local.
const URL_FILTER_FIELDS = ['status', 'category', 'tag'] as const

/** Seed pills from the URL (dashboard / sidebar / tag / category deep links);
 *  unknown or `all` statuses seed nothing — absence IS the unfiltered state. */
export function postFiltersFromSearch(search: string): ActiveFilter<PostFilterFieldKey>[] {
  const params = new URLSearchParams(search)
  const pills: ActiveFilter<PostFilterFieldKey>[] = []
  const status = params.get('status')
  // Deep links bookmarked before the P2-11 rename carry `hidden` — map to `unlisted` (fix-review).
  const normalizedStatus = status === 'hidden' ? 'unlisted' : status
  if (
    normalizedStatus === 'published' ||
    normalizedStatus === 'draft' ||
    normalizedStatus === 'unlisted' ||
    normalizedStatus === 'deleted'
  ) {
    pills.push({
      field: 'status',
      value: normalizedStatus,
      label: POST_STATUS_OPTIONS.find((o) => o.value === normalizedStatus)?.label ?? normalizedStatus,
    })
  }
  const category = params.get('category')
  if (category) {
    // The human label resolves once the category options load — until then the pill editor falls back to the raw id.
    pills.push({ field: 'category', value: category, label: category })
  }
  const tag = params.get('tag')
  if (tag) {
    pills.push({ field: 'tag', value: tag, label: tag })
  }
  return pills
}

/** Reconcile the URL-backed pills after a navigation while already on the
 *  posts list — user-added pills (author) survive. */
export function syncPostFiltersFromUrl(
  filters: ActiveFilter<PostFilterFieldKey>[],
  dispatch: (action: FilterPillsAction<PostFilterFieldKey>) => void,
  search: string,
): void {
  const seeded = postFiltersFromSearch(search)
  for (const field of URL_FILTER_FIELDS) {
    const next = seeded.find((f) => f.field === field)
    const current = filters.find((f) => f.field === field)
    if (next && current?.value !== next.value) {
      dispatch({ type: 'addFilter', field: next.field, value: next.value, label: next.label })
    } else if (!next && current) {
      dispatch({ type: 'removeFilter', field })
    }
  }
}
