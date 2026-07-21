import { useState } from 'react'

// Filter state for the users admin list. Server rows live exclusively in
// the TanStack cache (useInfiniteQuery in UsersView) — this hook owns only
// the UI filters.

export type RoleFilter = 'all' | 'admin' | 'author' | 'visitor' | 'normal'
export type SortOrder = 'recent' | 'commentCount'

export interface UsersFilters {
  q: string
  role: RoleFilter
  sortBy: SortOrder
  pageSize: number
  includeDeleted: boolean
}

export function useUsersFilters() {
  const [q, setQ] = useState('')
  const [role, setRole] = useState<RoleFilter>('all')
  const [sortBy, setSortBy] = useState<SortOrder>('recent')
  const [pageSize, setPageSize] = useState(20)
  const [includeDeleted, setIncludeDeleted] = useState(false)

  return {
    filters: { q, role, sortBy, pageSize, includeDeleted } satisfies UsersFilters,
    setQ,
    setRole,
    setSortBy,
    setPageSize,
    setIncludeDeleted,
  }
}
