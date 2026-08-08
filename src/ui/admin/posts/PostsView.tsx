import { useQuery } from '@tanstack/react-query'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'

import { orpcQuery } from '@/client/api/orpc-query'
import {
  buildPostFilterFields,
  postFiltersFromSearch,
  type PostsFilterQuery,
  syncPostFiltersFromUrl,
} from '@/ui/admin/posts/filter-fields'
import { PostRow } from '@/ui/admin/posts/PostRow'
import { PostsSkeleton } from '@/ui/admin/posts/PostsSkeleton'
import { AdminInfiniteListFooter } from '@/ui/admin/shared/AdminInfiniteListFooter'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { FilterPillBar } from '@/ui/admin/shared/filter-bar/FilterPillBar'
import { useFilterPills } from '@/ui/admin/shared/filter-bar/useFilterPills'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

const SORT_OPTIONS = [
  { value: 'publishedAt-desc', label: '最新发布' },
  { value: 'publishedAt-asc', label: '最早发布' },
  { value: 'updatedAt-desc', label: '最近更新' },
  { value: 'updatedAt-asc', label: '最早更新' },
]

const PAGE_SIZE = 10

const pill =
  'h-9 gap-1 rounded-(--radius) border-border px-3 text-(--text-admin-sm) font-medium shadow-none hover:bg-accent focus-visible:border-border focus-visible:ring-0 data-[popup-open]:border-border data-[popup-open]:ring-0'

export function PostsView() {
  const { data: categoriesData } = useQuery(orpcQuery.admin.categories.list.queryOptions({ input: {} }))
  const { data: tagsData } = useQuery(orpcQuery.admin.tags.list.queryOptions({ input: { limit: 100 } }))
  const { data: usersData } = useQuery(
    orpcQuery.admin.users.list.queryOptions({ input: { limit: 100, hasPosts: true } }),
  )

  const fields = useMemo(
    () =>
      buildPostFilterFields({
        categories: categoriesData?.categories ?? [],
        tags: (tagsData?.tags ?? []).map((t) => t.name),
        authors: usersData?.users ?? [],
      }),
    [categoriesData, tagsData, usersData],
  )

  // The pills own the filter surface: reducer state + merged query input; the URL seeds them and re-syncs on navigation.
  const { search } = useLocation()
  const [initialFilters] = useState(() => postFiltersFromSearch(search))
  const pills = useFilterPills({ fields, initial: initialFilters })

  const [sortBy, setSortBy] = useState<'publishedAt' | 'updatedAt'>('publishedAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // URL → pills sync via the "adjust state during render" pattern; UI-driven changes never touch `search`.
  const [lastSearch, setLastSearch] = useState(search)
  if (search !== lastSearch) {
    setLastSearch(search)
    syncPostFiltersFromUrl(pills.filters, pills.dispatch, search)
  }

  const { rows, total, isLoading, hasNextPage, isFetchingNextPage, sentinelRef } = useAdminInfiniteList({
    namespace: orpcQuery.admin.posts.list,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({
      ...pills.queryInput<PostsFilterQuery>(),
      offset,
      limit: PAGE_SIZE,
      sortBy,
      sortOrder,
    }),
    selectRows: (page) => page.posts,
    noun: '文章',
  })

  const sortValue = `${sortBy}-${sortOrder}`

  const filterBar = <FilterPillBar {...pills.bar} />

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
            {/* Header slot only when no filters are active — the body slot below takes over otherwise. */}
            {!pills.hasFilters && filterBar}

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
            <Link
              to="/editor/post/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-(--radius) bg-primary px-3 font-medium text-(--text-admin-sm) text-primary-foreground shadow-none hover:bg-primary/90"
            >
              <PlusIcon className="size-4" />
              新建文章
            </Link>
          </div>
        </AdminListPage.Header>

        {pills.hasFilters && filterBar}

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
                  <PostRow
                    key={row.id}
                    post={row}
                    onFilterCategory={(categoryId, categoryName) =>
                      pills.dispatch({ type: 'addFilter', field: 'category', value: categoryId, label: categoryName })
                    }
                  />
                ))}
              </div>
              {hasNextPage && <div ref={sentinelRef} className="h-1" />}
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
