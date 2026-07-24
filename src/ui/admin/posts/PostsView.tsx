import { useQuery } from '@tanstack/react-query'
import { PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'

import type { AdminUserDto } from '@/shared/contracts/users'

import { orpcQuery } from '@/client/api/orpc-query'
import { PostRow } from '@/ui/admin/posts/PostRow'
import { PostsSkeleton } from '@/ui/admin/posts/PostsSkeleton'
import {
  deriveStatusFields,
  type PostStatusFilter,
  type PostsFilters,
  usePostsFilters,
} from '@/ui/admin/posts/usePostsFilters'
import { AdminInfiniteListFooter } from '@/ui/admin/shared/AdminInfiniteListFooter'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
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

function buildQueryInput(filters: PostsFilters, offset: number) {
  return {
    ...deriveStatusFields(filters.status),
    offset,
    limit: PAGE_SIZE,
    categoryId: filters.category || undefined,
    tag: filters.tag || undefined,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    authorId: filters.authorId || undefined,
  }
}

export function PostsView() {
  const { filters, setStatus, setCategory, setTag, setAuthorId, setSortBy, setSortOrder } = usePostsFilters()

  const { rows, total, isLoading, hasNextPage, isFetchingNextPage, sentinelRef } = useAdminInfiniteList({
    namespace: orpcQuery.admin.posts.list,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => buildQueryInput(filters, offset),
    selectRows: (page) => page.posts,
    noun: '文章',
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

  const sortValue = `${filters.sortBy}-${filters.sortOrder}`

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title={
            <>
              文章管理 <span className="text-sm font-normal text-muted-foreground">{total}</span>
            </>
          }
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Status */}
            <Select
              items={STATUS_OPTIONS}
              value={filters.status}
              onValueChange={(value) => setStatus((value ?? 'all') as PostStatusFilter)}
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
                value={filters.category}
                onValueChange={(value) => setCategory(value ?? '')}
              >
                <SelectTrigger className={cn(pill, filters.category && 'pr-7 [&>span:last-child]:hidden')}>
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
              {filters.category && (
                <button
                  type="button"
                  onClick={() => setCategory('')}
                  className="absolute top-1/2 right-1.5 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>

            {/* Tag */}
            <div className="relative">
              <Combobox items={tagNames} value={filters.tag || null} onValueChange={(value) => setTag(value ?? '')}>
                <ComboboxTrigger className={cn(pill, filters.tag && 'pr-7 [&>span:last-child]:hidden')}>
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
              {filters.tag && (
                <button
                  type="button"
                  onClick={() => setTag('')}
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
                  setSortBy(rawSortBy)
                  setSortOrder(rawSortOrder)
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
          ) : rows.length === 0 ? (
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
                {rows.map((row) => (
                  <PostRow key={row.id} post={row} onFilterCategory={(category) => setCategory(category)} />
                ))}
              </div>
              {/* Sentinel for infinite scroll */}
              {hasNextPage && <div ref={sentinelRef} className="h-1" />}
              {/* Bottom status */}
              <AdminInfiniteListFooter
                noun="文章"
                rowCount={rows.length}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
              />
            </>
          )}
        </AdminListPage.Body>
      </AdminListPage>
    </>
  )
}
