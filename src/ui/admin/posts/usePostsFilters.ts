import { useState } from 'react'
import { useLocation } from 'react-router'

// Filter state for the posts admin list. Server rows live in the TanStack
// cache (PostsView) — this hook owns only the UI filters plus their URL
// search-param init/sync for dashboard links (?status= / ?tag= / ?category=).

export type PostStatusFilter = 'all' | 'published' | 'draft' | 'hidden' | 'deleted'

export interface PostsFilters {
  status: PostStatusFilter
  category: string
  tag: string
  authorId: string
  sortBy: 'publishedAt' | 'updatedAt'
  sortOrder: 'asc' | 'desc'
}

function getInitialStatusFromSearch(search: string): PostStatusFilter {
  const status = new URLSearchParams(search).get('status')
  if (status === 'draft' || status === 'published' || status === 'hidden' || status === 'deleted') {
    return status
  }
  return 'all'
}

function getInitialTagFromSearch(search: string): string {
  return new URLSearchParams(search).get('tag') ?? ''
}

function getInitialCategoryFromSearch(search: string): string {
  return new URLSearchParams(search).get('category') ?? ''
}

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

export function usePostsFilters() {
  const { search } = useLocation()
  const [status, setStatus] = useState<PostStatusFilter>(() => getInitialStatusFromSearch(search))
  // Opaque filter token — holds the category ID string; the `?category=`
  // URL param is admin-internal.
  const [category, setCategory] = useState(() => getInitialCategoryFromSearch(search))
  const [tag, setTag] = useState(() => getInitialTagFromSearch(search))
  const [authorId, setAuthorId] = useState('')
  const [sortBy, setSortBy] = useState<PostsFilters['sortBy']>('publishedAt')
  const [sortOrder, setSortOrder] = useState<PostsFilters['sortOrder']>('desc')

  // URL → state sync via the sanctioned "adjust state during render" pattern.
  // UI-driven filter changes never touch `search`, so this only runs on real
  // navigation and can't clobber the user's in-progress edits.
  const [lastSearch, setLastSearch] = useState(search)
  if (search !== lastSearch) {
    setLastSearch(search)
    setStatus(getInitialStatusFromSearch(search))
    setTag(getInitialTagFromSearch(search))
    setCategory(getInitialCategoryFromSearch(search))
  }

  return {
    filters: { status, category, tag, authorId, sortBy, sortOrder } satisfies PostsFilters,
    setStatus,
    setCategory,
    setTag,
    setAuthorId,
    setSortBy,
    setSortOrder,
  }
}
