import { useQuery } from '@tanstack/react-query'
import { LoaderIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import type { AdminUserDto } from '@/shared/types/users'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'
import { PostRow } from '@/ui/admin/posts/PostRow'
import { PostsSkeleton } from '@/ui/admin/posts/PostsSkeleton'
import { type PostStatusFilter, usePostsReducer } from '@/ui/admin/posts/usePostsReducer'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from '@/ui/components/combobox'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { cn } from '@/ui/lib/cn'

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'hidden', label: '隐藏' },
  { value: 'deleted', label: '已删除' },
]

const SORT_OPTIONS = [
  { value: 'publishedAt-desc', label: '最新发布' },
  { value: 'publishedAt-asc', label: '最早发布' },
  { value: 'updatedAt-desc', label: '最近更新' },
  { value: 'updatedAt-asc', label: '最早更新' },
]

const PAGE_SIZE = 10

const pill =
  'h-9 gap-1 rounded-(--radius) border-border px-3 text-(--text-admin-sm) font-medium shadow-none hover:bg-accent focus-visible:border-border focus-visible:ring-0 data-[popup-open]:border-border data-[popup-open]:ring-0'

function buildQueryInput(state: ReturnType<typeof usePostsReducer>['state'], offset: number) {
  return {
    q: state.q || undefined,
    deletedStatus: state.deletedStatus,
    offset,
    limit: PAGE_SIZE,
    categoryId: state.category || undefined,
    tag: state.tag || undefined,
    published: state.published,
    visible: state.visible,
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    authorId: state.authorId || undefined,
  }
}

export function PostsView() {
  const { state, dispatch } = usePostsReducer()

  // --- Initial page query ---
  const {
    data: listData,
    isPending: isListPending,
    error: listError,
  } = useQuery(
    orpcQuery.admin.posts.list.queryOptions({
      input: buildQueryInput(state, 0),
    }),
  )

  useEffect(() => {
    if (listData) {
      dispatch({ type: 'loaded', rows: listData.posts, total: listData.total })
    }
  }, [listData, dispatch])

  useEffect(() => {
    if (listError) {
      toast.error('加载文章列表失败', { description: listError.message })
    }
  }, [listError])

  // --- Infinite scroll: load more ---
  const [loadingMore, setLoadingMore] = useState(false)
  const hasMore = state.rows.length < state.total

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) {
      return
    }
    setLoadingMore(true)
    try {
      const result = await orpc.admin.posts.list(buildQueryInput(state, state.rows.length))
      dispatch({ type: 'appended', rows: result.posts, total: result.total })
    } catch (err) {
      toast.error('加载更多文章失败', {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, state, dispatch])

  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: hasMore,
    isFetchingNextPage: loadingMore,
    fetchNextPage: loadMore,
  })

  // --- Filter option data ---
  const { data: categoriesData } = useQuery(orpcQuery.admin.categories.list.queryOptions({ input: {} }))
  const { data: tagsData } = useQuery(orpcQuery.admin.tags.list.queryOptions({ input: { limit: 100 } }))
  const { data: usersData } = useQuery(
    orpcQuery.admin.users.list.queryOptions({ input: { limit: 100, hasPosts: true } }),
  )

  const categories = categoriesData?.categories
  const tags = tagsData?.tags
  const users = usersData?.users

  const categoryOptions = useMemo(
    () => [{ value: '', label: '全部分类' }, ...(categories ?? []).map((c) => ({ value: c.id, label: c.name }))],
    [categories],
  )
  const tagNames = useMemo(() => (tags ?? []).map((t) => t.name), [tags])
  const authorOptions = useMemo(
    () => [
      { value: '', label: '全部作者' },
      ...(users ?? []).map((u: AdminUserDto) => ({ value: u.id, label: u.name })),
    ],
    [users],
  )

  const isLoading = isListPending && state.rows.length === 0
  const sortValue = `${state.sortBy}-${state.sortOrder}`

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title={
            <>
              文章管理 <span className="text-sm font-normal text-muted-foreground">{state.total}</span>
            </>
          }
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Status */}
            <Select
              items={STATUS_OPTIONS}
              value={state.status}
              onValueChange={(value) => {
                dispatch({ type: 'setStatus', value: (value ?? 'all') as PostStatusFilter })
              }}
            >
              <SelectTrigger className={pill}>
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

            {/* Category */}
            <div className="relative">
              <Select
                items={categoryOptions}
                value={state.category}
                onValueChange={(value) => dispatch({ type: 'setCategory', value: value ?? '' })}
              >
                <SelectTrigger className={cn(pill, state.category && 'pr-7 [&>span:last-child]:hidden')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.category && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'setCategory', value: '' })}
                  className="absolute top-1/2 right-1.5 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>

            {/* Tag */}
            <div className="relative">
              <Combobox
                items={tagNames}
                value={state.tag || null}
                onValueChange={(value) => dispatch({ type: 'setTag', value: value ?? '' })}
              >
                <ComboboxTrigger className={cn(pill, state.tag && 'pr-7 [&>span:last-child]:hidden')}>
                  <ComboboxValue placeholder="全部标签" />
                </ComboboxTrigger>
                <ComboboxContent<string> inputPlaceholder="搜索标签…" emptyMessage="无匹配标签">
                  {(item) => (
                    <ComboboxItem key={item} value={item}>
                      {item}
                    </ComboboxItem>
                  )}
                </ComboboxContent>
              </Combobox>
              {state.tag && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'setTag', value: '' })}
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

            {/* Sort */}
            <Select
              items={SORT_OPTIONS}
              value={sortValue}
              onValueChange={(value) => {
                if (!value) {
                  return
                }
                const dashIdx = value.indexOf('-')
                const rawSortBy = value.slice(0, dashIdx)
                const rawSortOrder = value.slice(dashIdx + 1)
                if (
                  (rawSortBy === 'publishedAt' || rawSortBy === 'updatedAt') &&
                  (rawSortOrder === 'asc' || rawSortOrder === 'desc')
                ) {
                  dispatch({ type: 'setSortBy', value: rawSortBy })
                  dispatch({ type: 'setSortOrder', value: rawSortOrder })
                }
              }}
            >
              <SelectTrigger className={pill}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* New post */}
            <Link
              to="/editor/post/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-(--radius) bg-primary px-3 font-medium text-(--text-admin-sm) text-primary-foreground shadow-none hover:bg-primary/90"
            >
              <PlusIcon className="size-4" />
              新建文章
            </Link>
          </div>
        </AdminListPage.Header>

        <AdminListPage.Body>
          {isLoading ? (
            <PostsSkeleton />
          ) : state.rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>未找到文章</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="divide-y">
                {state.rows.map((row) => (
                  <PostRow
                    key={row.id}
                    post={row}
                    onFilterCategory={(category) => dispatch({ type: 'setCategory', value: category })}
                  />
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
                  '已加载全部文章'
                ) : null}
              </div>
            </>
          )}
        </AdminListPage.Body>
      </AdminListPage>
    </>
  )
}
