import { useState } from 'react'

// Filter state for the pages admin list. Server rows live exclusively in
// the TanStack cache (useInfiniteQuery in PagesView) — this hook owns only
// the UI filters.

export type PageStatusFilter = 'all' | 'published' | 'draft' | 'deleted'

export interface PagesFilters {
  status: PageStatusFilter
  authorId: string
}

/** Map the status filter onto the list API's deleted/published flags. */
export function deriveStatusFields(status: PageStatusFilter): {
  deletedStatus: 'all' | 'deleted' | 'normal'
  published?: boolean
} {
  if (status === 'deleted') {
    return { deletedStatus: 'deleted' }
  }
  const statusMap: Record<Exclude<PageStatusFilter, 'deleted'>, { published?: boolean }> = {
    all: {},
    published: { published: true },
    draft: { published: false },
  }
  return { deletedStatus: 'normal', ...statusMap[status as Exclude<PageStatusFilter, 'deleted'>] }
}

export function usePagesFilters() {
  const [status, setStatus] = useState<PageStatusFilter>('all')
  const [authorId, setAuthorId] = useState('')

  return {
    filters: { status, authorId } satisfies PagesFilters,
    setStatus,
    setAuthorId,
  }
}
