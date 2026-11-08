import { useQuery } from '@tanstack/react-query'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
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
import { useI18n } from '@/ui/lib/I18nProvider'

const SORT_OPTIONS = [
  { value: 'publishedAt-desc', labelId: 'admin.posts.sort.latestPublished' },
  { value: 'publishedAt-asc', labelId: 'admin.posts.sort.earliestPublished' },
  { value: 'updatedAt-desc', labelId: 'admin.posts.sort.latestUpdated' },
  { value: 'updatedAt-asc', labelId: 'admin.posts.sort.earliestUpdated' },
] as const

const PAGE_SIZE = 10

const pill =
  'h-9 gap-1 rounded-(--radius) border-border px-3 text-(--text-admin-sm) font-medium shadow-none hover:bg-accent focus-visible:border-border focus-visible:ring-0 data-[popup-open]:border-border data-[popup-open]:ring-0'

export function PostsView() {
  const { t } = useI18n()
  const { data: categoriesData } = useQuery(orpcQuery.admin.categories.list.queryOptions({ input: {} }))
  const { data: tagsData } = useQuery(orpcQuery.admin.tags.list.queryOptions({ input: { limit: 100 } }))
  const { data: usersData } = useQuery(
    orpcQuery.admin.users.list.queryOptions({ input: { limit: 100, hasPosts: true } }),
  )

  const fields = useMemo(
    () =>
      buildPostFilterFields(
        {
          categories: categoriesData?.categories ?? [],
          tags: (tagsData?.tags ?? []).map((tag) => tag.name),
          authors: usersData?.users ?? [],
        },
        t,
      ),
    [categoriesData, tagsData, usersData, t],
  )

  // The pills own the filter surface: reducer state + merged query input; the URL seeds them and re-syncs on navigation.
  const { search } = useLocation()
  const [initialFilters] = useState(() => postFiltersFromSearch(search, t))
  const pills = useFilterPills({ fields, initial: initialFilters })

  const [sortBy, setSortBy] = useState<'publishedAt' | 'updatedAt'>('publishedAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // URL → pills sync via the "adjust state during render" pattern; UI-driven changes never touch `search`.
  const [lastSearch, setLastSearch] = useState(search)
  if (search !== lastSearch) {
    setLastSearch(search)
    syncPostFiltersFromUrl(pills.filters, pills.dispatch, search, t)
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
    noun: 'admin.list.noun.posts',
  })

  const sortValue = `${sortBy}-${sortOrder}`

  const filterBar = <FilterPillBar {...pills.bar} />

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title={
            <>
              {t('admin.posts.title')} <span className="text-sm font-normal text-muted-foreground">{total}</span>
            </>
          }
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Header slot only when no filters are active — the body slot below takes over otherwise. */}
            {!pills.hasFilters && filterBar}

            <Select
              items={SORT_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelId) }))}
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
                    {t(item.labelId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link
              to="/editor/post/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-(--radius) bg-primary px-3 font-medium text-(--text-admin-sm) text-primary-foreground shadow-none hover:bg-primary/90"
            >
              <PlusIcon className="size-4" />
              {t('admin.posts.new')}
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
                <EmptyTitle>{t('admin.posts.empty')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="divide-y">
                {rows.map((row, index) => {
                  const postRow = (
                    <PostRow
                      post={row}
                      onFilterCategory={(categoryId, categoryName) =>
                        pills.dispatch({ type: 'addFilter', field: 'category', value: categoryId, label: categoryName })
                      }
                    />
                  )
                  return index === rows.length - 1 ? (
                    <Fragment key={row.id} ref={sentinelRef}>
                      {postRow}
                    </Fragment>
                  ) : (
                    <Fragment key={row.id}>{postRow}</Fragment>
                  )
                })}
              </div>
              <AdminInfiniteListFooter
                noun={t('admin.list.noun.posts')}
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
