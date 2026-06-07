import { useQuery } from '@tanstack/react-query'
import { LoaderIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import type { AdminUserDto } from '@/shared/types/users'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { PageRow } from '@/ui/admin/pages/PageRow'
import { PagesSkeleton } from '@/ui/admin/pages/PagesSkeleton'
import { type PageStatusFilter, usePagesController } from '@/ui/admin/pages/usePagesController'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { cn } from '@/ui/lib/cn'

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'deleted', label: '已删除' },
]

const PAGE_SIZE = 10

const pill =
  'h-9 gap-1 rounded-(--radius) border-border px-3 text-(--text-admin-sm) font-medium shadow-none hover:bg-accent focus-visible:border-border focus-visible:ring-0 data-[popup-open]:border-border data-[popup-open]:ring-0'

function buildQueryInput(state: ReturnType<typeof usePagesController>['state'], offset: number) {
  return {
    q: state.q || undefined,
    deletedStatus: state.deletedStatus,
    published: state.published,
    offset,
    limit: PAGE_SIZE,
    authorId: state.authorId || undefined,
  }
}

export function PagesView() {
  const { state, dispatch } = usePagesController()

  // --- Initial page query ---
  const {
    data: listData,
    isPending: isListPending,
    error: listError,
  } = useQuery(
    orpcQuery.admin.pages.list.queryOptions({
      input: buildQueryInput(state, 0),
    }),
  )

  useEffect(() => {
    if (listData) {
      dispatch({ type: 'loaded', rows: listData.pages, total: listData.total })
    }
  }, [listData, dispatch])

  useEffect(() => {
    if (listError) {
      toast.error('加载页面列表失败', { description: listError.message })
    }
  }, [listError])

  // --- Infinite scroll: load more ---
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasMore = state.rows.length < state.total

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) {
      return
    }
    setLoadingMore(true)
    try {
      const result = await orpc.admin.pages.list(buildQueryInput(state, state.rows.length))
      dispatch({ type: 'appended', rows: result.pages, total: result.total })
    } catch (err) {
      toast.error('加载更多页面失败', {
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

  const isLoading = isListPending && state.rows.length === 0

  // --- Filter option data ---
  const { data: usersData } = useQuery(
    orpcQuery.admin.users.list.queryOptions({ input: { limit: 100, hasPages: true } }),
  )
  const users = usersData?.users
  const authorOptions = useMemo(
    () => [
      { value: '', label: '全部作者' },
      ...(users ?? []).map((u: AdminUserDto) => ({ value: u.id, label: u.name })),
    ],
    [users],
  )

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title={
            <>
              页面管理 <span className="text-sm font-normal text-muted-foreground">{state.total}</span>
            </>
          }
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Status */}
            <div className="relative">
              <Select
                items={STATUS_OPTIONS}
                value={state.status}
                onValueChange={(value) => {
                  dispatch({ type: 'setStatus', value: (value ?? 'all') as PageStatusFilter })
                }}
              >
                <SelectTrigger className={cn(pill, state.status !== 'all' && 'pr-7 [&>span:last-child]:hidden')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.status !== 'all' && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'setStatus', value: 'all' })}
                  className="absolute top-1/2 right-1.5 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>

            {/* Author */}
            <div className="relative">
              <Select
                items={authorOptions}
                value={state.authorId}
                onValueChange={(value) => dispatch({ type: 'setAuthorId', value: value ?? '' })}
              >
                <SelectTrigger className={cn(pill, state.authorId && 'pr-7 [&>span:last-child]:hidden')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {authorOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.authorId && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'setAuthorId', value: '' })}
                  className="absolute top-1/2 right-1.5 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>

            {/* New page */}
            <Link
              to="/editor/page/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-(--radius) bg-primary px-3 font-medium text-(--text-admin-sm) text-primary-foreground shadow-none hover:bg-primary/90"
            >
              <PlusIcon className="size-4" />
              新建页面
            </Link>
          </div>
        </AdminListPage.Header>

        <AdminListPage.Body>
          {isLoading ? (
            <PagesSkeleton />
          ) : state.rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>未找到页面</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="divide-y">
                {state.rows.map((row) => (
                  <PageRow key={row.id} page={row} />
                ))}
              </div>
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
                  '已加载全部页面'
                ) : null}
              </div>
            </>
          )}
        </AdminListPage.Body>
      </AdminListPage>
    </>
  )
}
