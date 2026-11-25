import { orpcQuery } from '@kobato/api/browser/orpc-query'
import { Button } from '@kobato/ui/components/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@kobato/ui/components/empty'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { buildPageFilterFields, type PagesFilterQuery } from '@kobato/web-admin/ui/pages/filter-fields'
import { PageRow } from '@kobato/web-admin/ui/pages/PageRow'
import { PagesSkeleton } from '@kobato/web-admin/ui/pages/PagesSkeleton'
import { FilterPillBar } from '@kobato/web-admin/ui/shared/filter-bar/FilterPillBar'
import { useFilterPills } from '@kobato/web-admin/ui/shared/filter-bar/use-filter-pills'
import { AdminInfiniteListFooter } from '@kobato/web-admin/ui/shared/list/AdminInfiniteListFooter'
import { AdminListPage } from '@kobato/web-admin/ui/shared/list/AdminListPage'
import { useAdminInfiniteList } from '@kobato/web-admin/ui/shared/list/use-admin-infinite-list'
import { useQuery } from '@tanstack/react-query'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { Link } from 'react-router'

const PAGE_SIZE = 10

export function PagesView() {
  const { t } = useI18n()
  const { data: usersData } = useQuery(
    orpcQuery.admin.users.list.queryOptions({ input: { limit: 100, hasPages: true } }),
  )

  const fields = useMemo(() => buildPageFilterFields(usersData?.users ?? [], t), [usersData, t])

  const pills = useFilterPills({ fields })

  const { rows, total, isLoading, hasNextPage, isFetchingNextPage, sentinelRef } = useAdminInfiniteList({
    namespace: orpcQuery.admin.pages.list,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({ ...pills.queryInput<PagesFilterQuery>(), offset, limit: PAGE_SIZE }),
    selectRows: (page) => page.pages,
    noun: 'admin.list.noun.pages',
  })

  const filterBar = <FilterPillBar {...pills.bar} />

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title={
            <>
              {t('admin.pages.title')} <span className="text-sm font-normal text-muted-foreground">{total}</span>
            </>
          }
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!pills.hasFilters && filterBar}

            <Button type="button" size="sm" render={<Link to="/editor/page/new" />}>
              <PlusIcon data-icon />
              {t('admin.pages.new')}
            </Button>
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
                <EmptyTitle>{t('admin.pages.empty')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="divide-y">
                {rows.map((row, index) =>
                  index === rows.length - 1 ? (
                    <Fragment key={row.id} ref={sentinelRef}>
                      <PageRow page={row} />
                    </Fragment>
                  ) : (
                    <PageRow key={row.id} page={row} />
                  ),
                )}
              </div>
              <AdminInfiniteListFooter
                noun={t('admin.list.noun.pages')}
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
