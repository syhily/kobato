import { FolderIcon, ListChecksIcon, TagsIcon, UserIcon } from 'lucide-react'

import type { FilterFieldSpec, FilterQueryPatch } from '@/ui/admin/shared/filter-bar/types'
import type { ActiveFilter, FilterPillsAction } from '@/ui/admin/shared/filterPillsReducer'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Posts-list filter-pill field specs — keys, labels, icons, option arrays,
// the URL search-param seed/sync helpers (dashboard / sidebar / tag /
// category links land on `/admin/posts?status=` / `?tag=` / `?category=`),
// and the `toQuery` mappers onto `admin.posts.list`'s input.
// `buildPostFilterFields` is a factory (memoized by the view) because the
// category / tag / author options come from async option-list queries.

export type PostFilterFieldKey = 'status' | 'category' | 'tag' | 'author'

export type PostStatusFilter = 'all' | 'published' | 'draft' | 'hidden' | 'deleted'

export const POST_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'hidden', label: '隐藏' },
  { value: 'deleted', label: '已删除' },
]

/** Map the status filter onto the list API's deleted/published/visible flags. */
export function deriveStatusFields(status: PostStatusFilter): {
  deletedStatus: 'all' | 'deleted' | 'normal'
  published?: boolean
  visible?: boolean
} {
  if (status === 'deleted') {
    return { deletedStatus: 'deleted' }
  }
  const statusMap: Record<Exclude<PostStatusFilter, 'deleted'>, { published?: boolean; visible?: boolean }> = {
    all: {},
    published: { published: true, visible: true },
    draft: { published: false },
    hidden: { published: true, visible: false },
  }
  return { deletedStatus: 'normal', ...statusMap[status as Exclude<PostStatusFilter, 'deleted'>] }
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
      // The status projection carries booleans; the string-typed patch is
      // the common case and the merge copies values verbatim, so the cast
      // is exact.
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

/** The URL-backed fields, in seed order — only these three sync from the
 *  URL; the author pill is UI-local. */
const URL_FILTER_FIELDS = ['status', 'category', 'tag'] as const

/** Seed pills from the URL search params (dashboard / sidebar / tag /
 *  category deep links). Unknown or `all` statuses seed nothing — the
 *  absent status pill IS the unfiltered state. */
export function postFiltersFromSearch(search: string): ActiveFilter<PostFilterFieldKey>[] {
  const params = new URLSearchParams(search)
  const pills: ActiveFilter<PostFilterFieldKey>[] = []
  const status = params.get('status')
  if (status === 'published' || status === 'draft' || status === 'hidden' || status === 'deleted') {
    pills.push({
      field: 'status',
      value: status,
      label: POST_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status,
    })
  }
  const category = params.get('category')
  if (category) {
    // The human label resolves from the category options once they load —
    // until then the pill editor falls back to the raw id.
    pills.push({ field: 'category', value: category, label: category })
  }
  const tag = params.get('tag')
  if (tag) {
    pills.push({ field: 'tag', value: tag, label: tag })
  }
  return pills
}

/** Reconcile the URL-backed pills (status / category / tag) after a
 *  navigation while already on the posts list — mirrors the retired
 *  usePostsFilters URL→state sync: user-added pills (author) survive. */
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
