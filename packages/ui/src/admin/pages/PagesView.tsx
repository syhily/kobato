import { orpcQuery } from '@kobato/client/api/orpc-query'
import { buildPageFilterFields, type PagesFilterQuery } from '@kobato/ui/admin/pages/filter-fields'
import { PageRow } from '@kobato/ui/admin/pages/PageRow'
import { PagesSkeleton } from '@kobato/ui/admin/pages/PagesSkeleton'
import { AdminInfiniteListFooter } from '@kobato/ui/admin/shared/AdminInfiniteListFooter'
import { AdminListPage } from '@kobato/ui/admin/shared/AdminListPage'
import { FilterPillBar } from '@kobato/ui/admin/shared/filter-bar/FilterPillBar'
import { useFilterPills } from '@kobato/ui/admin/shared/filter-bar/useFilterPills'
import { useAdminInfiniteList } from '@kobato/ui/admin/shared/useAdminInfiniteList'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@kobato/ui/components/empty'
import { useQuery } from '@tanstack/react-query'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'

const PAGE_SIZE = 10

export function PagesView() {
  // --- Filter option data ---
  const { data: usersData } = useQuery(
    orpcQuery.admin.users.list.queryOptions({ input: { limit: 100, hasPages: true } }),
  )

  const fields = useMemo(() => buildPageFilterFields(usersData?.users ?? []), [usersData])

  // The pills own the whole filter surface: reducer state and the merged
  // query input the list query spreads.
  const pills = useFilterPills({ fields })

  const { rows, total, isLoading, hasNextPage, isFetchingNextPage, sentinelRef } = useAdminInfiniteList({
    namespace: orpcQuery.admin.pages.list,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({ ...pills.queryInput<PagesFilterQuery>(), offset, limit: PAGE_SIZE }),
    selectRows: (page) => page.pages,
    noun: '页面',
  })

  const filterBar = <FilterPillBar {...pills.bar} />

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
            {/* Header slot only when no filters are active — the body slot below takes over otherwise. */}
            {!pills.hasFilters && filterBar}

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

        {pills.hasFilters && filterBar}

        <AdminListPage.Body>
          {isLoading ? (
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
              <AdminInfiniteListFooter
                noun="页面"
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
