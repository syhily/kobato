import { useState } from 'react'

// Filter state for the tags admin list. Server rows live exclusively in
// the TanStack cache (useInfiniteQuery in TagsView) — this hook owns only
// the search filter.
export function useTagsFilters() {
  const [q, setQ] = useState('')
  return { q, setQ }
}
