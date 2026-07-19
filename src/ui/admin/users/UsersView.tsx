import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderIcon, MailIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { InviteAuthorDialog } from '@/ui/admin/users/InviteAuthorDialog'
import { invalidateUsersCache } from '@/ui/admin/users/users-cache'
import { UsersTable } from '@/ui/admin/users/UsersTable'
import { UsersToolbar } from '@/ui/admin/users/UsersToolbar'
import { useUsersReducer } from '@/ui/admin/users/useUsersReducer'
import { Button } from '@/ui/components/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/components/input-group'

function buildQueryInput(state: ReturnType<typeof useUsersReducer>['state'], offset: number) {
  return {
    offset,
    limit: state.pageSize,
    q: state.q || undefined,
    role: state.role !== 'all' ? state.role : undefined,
    includeDeleted: state.includeDeleted ? true : undefined,
    sortBy: state.sortBy !== 'recent' ? state.sortBy : undefined,
  }
}

export function UsersView() {
  const config = useSiteIdentity()
  const { state, dispatch } = useUsersReducer()

  const queryClient = useQueryClient()

  // --- Initial page query ---
  const {
    data: listData,
    isPending: isListPending,
    error: listError,
  } = useQuery(
    orpcQuery.admin.users.list.queryOptions({
      input: buildQueryInput(state, 0),
    }),
  )

  useEffect(() => {
    if (listData) {
      dispatch({
        type: 'loaded',
        rows: listData.users,
        total: listData.total,
        hasMore: listData.hasMore,
      })
    }
  }, [listData, dispatch])

  useEffect(() => {
    if (listError) {
      toast.error('加载用户列表失败', { description: listError.message })
    }
  }, [listError])

  // --- Infinite scroll: load more ---
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasMore = state.hasMore

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) {
      return
    }
    setLoadingMore(true)
    try {
      const result = await orpc.admin.users.list(buildQueryInput(state, state.rows.length))
      dispatch({ type: 'appended', rows: result.users, total: result.total, hasMore: result.hasMore })
    } catch (err) {
      toast.error('加载更多用户失败', {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, state, dispatch])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, hasMore])

  const [qInput, setQInput] = useDebouncedSearch({
    delayMs: 300,
    onChange: (value) => dispatch({ type: 'setQ', value }),
  })

  const isLoading = isListPending && state.rows.length === 0

  const [inviteOpen, setInviteOpen] = useState(false)

  return (
    <>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">用户管理</h1>
            {!isLoading && (
              <span className="text-lg font-normal text-muted-foreground">{state.total.toLocaleString()}</span>
            )}
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
              role={state.role}
              sortBy={state.sortBy}
              pageSize={state.pageSize}
              includeDeleted={state.includeDeleted}
              onRoleChange={(value) => dispatch({ type: 'setRole', value })}
              onSortByChange={(value) => dispatch({ type: 'setSortBy', value })}
              onPageSizeChange={(value) => dispatch({ type: 'setPageSize', value })}
              onIncludeDeletedChange={(value) => dispatch({ type: 'setIncludeDeleted', value })}
            />
            <Button type="button" variant="default" size="sm" onClick={() => setInviteOpen(true)}>
              <MailIcon data-icon /> 邀请作者
            </Button>
          </div>
        </header>

        <UsersTable rows={state.rows} config={config} isLoading={isLoading} />

        {/* Sentinel for infinite scroll */}
        {hasMore && <div ref={sentinelRef} className="h-1" />}
        {/* Bottom status */}
        <div className="py-6 text-center text-sm text-muted-foreground">
          {loadingMore ? (
            <span className="inline-flex items-center gap-2">
              <LoaderIcon className="size-4 animate-spin" />
              加载中…
            </span>
          ) : !hasMore && state.rows.length > 0 ? (
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
