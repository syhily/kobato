import { Button } from '@kobato/ui/components/button.tsx'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@kobato/ui/components/input-group.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { formatNumber } from '@kobato/utils/format.ts'
import { orpcQuery } from '@kobato/web/client/api/orpc-query.ts'
import { useSiteIdentity } from '@kobato/web/client/settings/blog-settings-context.tsx'
import { AdminInfiniteListFooter } from '@kobato/web/ui/admin/shared/AdminInfiniteListFooter.tsx'
import { useAdminInfiniteList } from '@kobato/web/ui/admin/shared/useAdminInfiniteList.ts'
import { InviteAuthorDialog } from '@kobato/web/ui/admin/users/InviteAuthorDialog.tsx'
import { invalidateUsersCache } from '@kobato/web/ui/admin/users/users-cache.ts'
import { UsersTable } from '@kobato/web/ui/admin/users/UsersTable.tsx'
import { UsersToolbar } from '@kobato/web/ui/admin/users/UsersToolbar.tsx'
import { type UsersFilters, useUsersFilters } from '@kobato/web/ui/admin/users/useUsersFilters.ts'
import { useDebouncedSearch } from '@kobato/web/ui/shared/use-debounced-search.ts'
import { useQueryClient } from '@tanstack/react-query'
import { MailIcon, SearchIcon } from 'lucide-react'
import { useState } from 'react'

function buildQueryInput(filters: UsersFilters, offset: number) {
  return {
    offset,
    limit: filters.pageSize,
    q: filters.q || undefined,
    role: filters.role !== 'all' ? filters.role : undefined,
    includeDeleted: filters.includeDeleted ? true : undefined,
    sortBy: filters.sortBy !== 'recent' ? filters.sortBy : undefined,
  }
}

export function UsersView() {
  const { locale, t } = useI18n()
  const config = useSiteIdentity()
  const { filters, setQ, setRole, setSortBy, setIncludeDeleted } = useUsersFilters()

  const queryClient = useQueryClient()

  const { rows, total, isLoading, hasNextPage, isFetchingNextPage, sentinelRef } = useAdminInfiniteList({
    namespace: orpcQuery.admin.users.list,
    pageSize: filters.pageSize,
    buildInput: (offset) => buildQueryInput(filters, offset),
    selectRows: (page) => page.users,
    noun: 'admin.list.noun.users',
  })

  const [qInput, setQInput] = useDebouncedSearch({
    delayMs: 300,
    onChange: setQ,
  })

  const [inviteOpen, setInviteOpen] = useState(false)

  return (
    <>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{t('admin.users.title')}</h1>
            {!isLoading && (
              <span className="text-sm font-normal text-muted-foreground">{formatNumber(total, { locale })}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <InputGroup className="h-9 w-full sm:w-56">
              <InputGroupAddon>
                <SearchIcon className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                size="sm"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder={t('admin.users.searchPlaceholder')}
              />
            </InputGroup>
            <UsersToolbar
              role={filters.role}
              sortBy={filters.sortBy}
              includeDeleted={filters.includeDeleted}
              onRoleChange={setRole}
              onSortByChange={setSortBy}
              onIncludeDeletedChange={setIncludeDeleted}
            />
            <Button type="button" variant="default" size="sm" onClick={() => setInviteOpen(true)}>
              <MailIcon data-icon /> {t('admin.users.invite')}
            </Button>
          </div>
        </header>

        <UsersTable rows={rows} config={config} isLoading={isLoading} sentinelRef={sentinelRef} />

        <AdminInfiniteListFooter
          noun={t('admin.list.noun.users')}
          rowCount={rows.length}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
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
