import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { LoaderIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import type { AdminUserDto } from '@/shared/types/users'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'
import { PageRow } from '@/ui/admin/pages/PageRow'
import { PagesSkeleton } from '@/ui/admin/pages/PagesSkeleton'
import {
  deriveStatusFields,
  type PageStatusFilter,
  type PagesFilters,
  usePagesFilters,
} from '@/ui/admin/pages/usePagesFilters'
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

function buildQueryInput(filters: PagesFilters, offset: number) {
  return {
    ...deriveStatusFields(filters.status),
    offset,
    limit: PAGE_SIZE,
    authorId: filters.authorId || undefined,
  }
}

export function PagesView() {
  const { filters, setStatus, setAuthorId } = usePagesFilters()

  // Server rows live exclusively in the TanStack cache — every loaded page
  // is refetched together on invalidation, and mutations invalidate this
  // namespace instead of patching local mirrors.
  const listQuery = useInfiniteQuery(
    orpcQuery.admin.pages.list.infiniteOptions({
      input: (pageParam: number) => buildQueryInput(filters, pageParam),
      getNextPageParam: (lastPage, _allPages, lastPageParam) => {
        if (!lastPage.hasMore) {
          return undefined
        }
        return (lastPageParam ?? 0) + PAGE_SIZE
      },
      initialPageParam: 0,
    }),
  )
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listQuery
  const sentinelRef = useInfiniteScrollSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage })

  const rows = useMemo(() => listQuery.data?.pages.flatMap((page) => page.pages) ?? [], [listQuery.data])
  const total = listQuery.data?.pages[0]?.total ?? 0

  useEffect(() => {
    if (listQuery.error) {
      toast.error('加载页面列表失败', { description: listQuery.error.message })
    }
  }, [listQuery.error])

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
              页面管理 <span className="text-sm font-normal text-muted-foreground">{total}</span>
            </>
          }
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Status */}
            <div className="relative">
              <Select
                items={STATUS_OPTIONS}
                value={filters.status}
                onValueChange={(value) => setStatus((value ?? 'all') as PageStatusFilter)}
              >
                <SelectTrigger className={cn(pill, filters.status !== 'all' && 'pr-7 [&>span:last-child]:hidden')}>
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
              {filters.status !== 'all' && (
                <button
                  type="button"
                  onClick={() => setStatus('all')}
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
                value={filters.authorId}
                onValueChange={(value) => setAuthorId(value ?? '')}
              >
                <SelectTrigger className={cn(pill, filters.authorId && 'pr-7 [&>span:last-child]:hidden')}>
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
              {filters.authorId && (
                <button
                  type="button"
                  onClick={() => setAuthorId('')}
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
          {listQuery.isLoading ? (
            <PagesSkeleton />
          ) : rows.length === 0 ? (
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
                {rows.map((row) => (
                  <PageRow key={row.id} page={row} />
                ))}
              </div>
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
