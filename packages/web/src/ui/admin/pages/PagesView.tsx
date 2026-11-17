import { useQuery } from '@tanstack/react-query'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { Link } from 'react-router'

import { orpcQuery } from '../../../client/api/orpc-query'
import { Button } from '../../components/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '../../components/empty'
import { useI18n } from '../../lib/I18nProvider'
import { AdminInfiniteListFooter } from '../shared/AdminInfiniteListFooter'
import { AdminListPage } from '../shared/AdminListPage'
import { FilterPillBar } from '../shared/filter-bar/FilterPillBar'
import { useFilterPills } from '../shared/filter-bar/useFilterPills'
import { useAdminInfiniteList } from '../shared/useAdminInfiniteList'
import { buildPageFilterFields, type PagesFilterQuery } from './filter-fields'
import { PageRow } from './PageRow'
import { PagesSkeleton } from './PagesSkeleton'

const PAGE_SIZE = 10

export function PagesView() {
  const { t } = useI18n()
  const { data: usersData } = useQuery(
    orpcQuery.admin.users.list.queryOptions({ input: { limit: 100, hasPages: true } }),
  )

  const fields = useMemo(() => buildPageFilterFields(usersData?.users ?? [], t), [usersData, t])

  // The pills own the filter surface: reducer state + merged query input the list query spreads.
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
            {/* Header slot only when no filters are active — the body slot below takes over otherwise. */}
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
