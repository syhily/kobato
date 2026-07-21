import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderIcon, MailIcon, SearchIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { InviteAuthorDialog } from '@/ui/admin/users/InviteAuthorDialog'
import { invalidateUsersCache } from '@/ui/admin/users/users-cache'
import { UsersTable } from '@/ui/admin/users/UsersTable'
import { UsersToolbar } from '@/ui/admin/users/UsersToolbar'
import { type UsersFilters, useUsersFilters } from '@/ui/admin/users/useUsersFilters'
import { Button } from '@/ui/components/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/components/input-group'

function buildQueryInput(filters: UsersFilters, offset: number) {
  return {
    offset,
    limit: filters.pageSize,
    q: filters.q || undefined,
    role: filters.role !== 'all' ? filters.role : undefined,
    includeDeleted: filters.includeDeleted ? true : undefined,
    sortBy: filters.sortBy !== 'recent' ? filters.sortBy : undefined,
  }
}

export function UsersView() {
  const config = useSiteIdentity()
  const { filters, setQ, setRole, setSortBy, setPageSize, setIncludeDeleted } = useUsersFilters()

  const queryClient = useQueryClient()

  // Server rows live exclusively in the TanStack cache — every loaded page
  // is refetched together on invalidation, and mutations invalidate this
  // namespace instead of patching local mirrors.
  const listQuery = useInfiniteQuery(
    orpcQuery.admin.users.list.infiniteOptions({
      input: (pageParam: number) => buildQueryInput(filters, pageParam),
      getNextPageParam: (lastPage, _allPages, lastPageParam) => {
        if (!lastPage.hasMore) {
          return undefined
        }
        return (lastPageParam ?? 0) + filters.pageSize
      },
      initialPageParam: 0,
    }),
  )
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listQuery
  const sentinelRef = useInfiniteScrollSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage })

  const rows = useMemo(() => listQuery.data?.pages.flatMap((page) => page.users) ?? [], [listQuery.data])
  const total = listQuery.data?.pages[0]?.total ?? 0

  useEffect(() => {
    if (listQuery.error) {
      toast.error('加载用户列表失败', { description: listQuery.error.message })
    }
  }, [listQuery.error])

  const [qInput, setQInput] = useDebouncedSearch({
    delayMs: 300,
    onChange: setQ,
  })

  const isLoading = listQuery.isLoading

  const [inviteOpen, setInviteOpen] = useState(false)

  return (
    <>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">用户管理</h1>
            {!isLoading && <span className="text-lg font-normal text-muted-foreground">{total.toLocaleString()}</span>}
          </div>
          <div className="flex items-center gap-2">
            <InputGroup className="h-9 w-full sm:w-56">
              <InputGroupAddon>
                <SearchIcon className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="搜索用户名或邮箱"
              />
            </InputGroup>
            <UsersToolbar
              role={filters.role}
              sortBy={filters.sortBy}
              pageSize={filters.pageSize}
              includeDeleted={filters.includeDeleted}
              onRoleChange={setRole}
              onSortByChange={setSortBy}
              onPageSizeChange={setPageSize}
              onIncludeDeletedChange={setIncludeDeleted}
            />
            <Button type="button" variant="default" size="sm" onClick={() => setInviteOpen(true)}>
              <MailIcon data-icon /> 邀请作者
            </Button>
          </div>
        </header>

        <UsersTable rows={rows} config={config} isLoading={isLoading} />

        {/* Sentinel for infinite scroll */}
        {hasNextPage && <div ref={sentinelRef} className="h-1" />}
        {/* Bottom status */}
        <div className="py-6 text-center text-sm text-muted-foreground">
          {isFetchingNextPage ? (
            <span className="inline-flex items-center gap-2">
              <LoaderIcon className="size-4 animate-spin" />
              加载中…
            </span>
          ) : !hasNextPage && rows.length > 0 ? (
            '已加载全部用户'
          ) : null}
        </div>
      </div>

      <InviteAuthorDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => {
          invalidateUsersCache(queryClient)
        }}
      />
    </>
  )
}
