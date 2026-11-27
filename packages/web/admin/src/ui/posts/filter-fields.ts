import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { I18nValue } from '@kobato/ui/lib/I18nProvider'
import type { ActiveFilter, FilterPillsAction } from '@kobato/web-admin/ui/shared/filter-bar/filter-pills-reducer'
import type { FilterFieldSpec, FilterQueryPatch } from '@kobato/web-admin/ui/shared/filter-bar/types'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { deriveStatusQueryFields } from '@kobato/web-admin/ui/shared/filter-bar/status-fields'
import { FolderIcon, ListChecksIcon, TagsIcon, UserIcon } from 'lucide-react'

export type PostFilterFieldKey = 'status' | 'category' | 'tag' | 'author'

export type PostStatusFilter = 'all' | 'published' | 'draft' | 'unlisted' | 'deleted'

export const POST_STATUS_OPTIONS: { value: string; labelId: UiMessageId }[] = [
  { value: 'published', labelId: 'admin.content.status.published' },
  { value: 'draft', labelId: 'admin.content.status.draft' },
  { value: 'unlisted', labelId: 'admin.content.status.unlisted' },
  { value: 'deleted', labelId: 'admin.content.status.deleted' },
]

const POST_STATUS_FIELDS: Record<Exclude<PostStatusFilter, 'deleted'>, { published?: boolean; visible?: boolean }> = {
  all: {},
  published: { published: true, visible: true },
  draft: { published: false },
  unlisted: { published: true, visible: false },
}

export function deriveStatusFields(status: PostStatusFilter): {
  deletedStatus: 'all' | 'deleted' | 'normal'
  published?: boolean
  visible?: boolean
} {
  return deriveStatusQueryFields(status, POST_STATUS_FIELDS)
}

export interface PostsFilterQuery {
  deletedStatus?: 'all' | 'deleted' | 'normal'
  published?: boolean
  visible?: boolean
  categoryId?: string
  tag?: string
  authorId?: string
}

export interface PostFilterFieldSources {
  categories: readonly { id: string; name: string }[]
  tags: readonly string[]
  authors: readonly { id: string; name: string }[]
}

export function buildPostFilterFields(
  { categories, tags, authors }: PostFilterFieldSources,
  t: I18nValue['t'],
): FilterFieldSpec<PostFilterFieldKey>[] {
  return [
    {
      key: 'status',
      label: t('admin.posts.filter.status'),
      icon: ListChecksIcon,
      kind: 'options',
      options: POST_STATUS_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelId) })),
      toQuery: (value) => unsafeCast<FilterQueryPatch>(deriveStatusFields(unsafeCast<PostStatusFilter>(value))),
    },
    {
      key: 'category',
      label: t('admin.posts.filter.category'),
      icon: FolderIcon,
      kind: 'options',
      options: categories.map((c) => ({ value: c.id, label: c.name })),
      toQuery: (value) => ({ categoryId: value }),
    },
    {
      key: 'tag',
      label: t('admin.posts.filter.tag'),
      icon: TagsIcon,
      kind: 'options',
      options: tags.map((name) => ({ value: name, label: name })),
      searchable: true,
      searchPlaceholder: t('admin.posts.filter.searchTags'),
      searchEmptyMessage: t('admin.posts.filter.noTags'),
      toQuery: (value) => ({ tag: value }),
    },
    {
      key: 'author',
      label: t('admin.posts.filter.author'),
      icon: UserIcon,
      kind: 'options',
      options: authors.map((u) => ({ value: u.id, label: u.name })),
      toQuery: (value) => ({ authorId: value }),
    },
  ]
}

const URL_FILTER_FIELDS = ['status', 'category', 'tag'] as const

export function postFiltersFromSearch(search: string, t: I18nValue['t']): ActiveFilter<PostFilterFieldKey>[] {
  const params = new URLSearchParams(search)
  const pills: ActiveFilter<PostFilterFieldKey>[] = []
  const status = params.get('status')
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
      label: (() => {
        const labelId = POST_STATUS_OPTIONS.find((o) => o.value === normalizedStatus)?.labelId
        return labelId ? t(labelId) : normalizedStatus
      })(),
    })
  }
  const category = params.get('category')
  if (category) {
    pills.push({ field: 'category', value: category, label: category })
  }
  const tag = params.get('tag')
  if (tag) {
    pills.push({ field: 'tag', value: tag, label: tag })
  }
  return pills
}

export function postFiltersToSearch(filters: ActiveFilter<PostFilterFieldKey>[], currentSearch: string): string | null {
  const params = new URLSearchParams(currentSearch)
  let changed = false
  for (const field of URL_FILTER_FIELDS) {
    const next = filters.find((f) => f.field === field)?.value ?? null
    if (params.get(field) !== next) {
      changed = true
      if (next === null) {
        params.delete(field)
      } else {
        params.set(field, next)
      }
    }
  }
  if (!changed) {
    return null
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

export function syncPostFiltersFromUrl(
  filters: ActiveFilter<PostFilterFieldKey>[],
  dispatch: (action: FilterPillsAction<PostFilterFieldKey>) => void,
  search: string,
  t: I18nValue['t'],
): void {
  const seeded = postFiltersFromSearch(search, t)
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
