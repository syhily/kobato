import { useQueryClient } from '@tanstack/react-query'
import { MailIcon, SearchIcon } from 'lucide-react'
import { useState } from 'react'

import { orpcQuery } from '@/client/api/orpc-query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { AdminInfiniteListFooter } from '@/ui/admin/shared/AdminInfiniteListFooter'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { InviteAuthorDialog } from '@/ui/admin/users/InviteAuthorDialog'
import { invalidateUsersCache } from '@/ui/admin/users/users-cache'
import { UsersTable } from '@/ui/admin/users/UsersTable'
import { UsersToolbar } from '@/ui/admin/users/UsersToolbar'
import { type UsersFilters, useUsersFilters } from '@/ui/admin/users/useUsersFilters'
import { Button } from '@/ui/components/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/components/input-group'

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
  const config = useSiteIdentity()
  const { filters, setQ, setRole, setSortBy, setIncludeDeleted } = useUsersFilters()

  const queryClient = useQueryClient()

  const { rows, total, isLoading, hasNextPage, isFetchingNextPage, sentinelRef } = useAdminInfiniteList({
    namespace: orpcQuery.admin.users.list,
    pageSize: filters.pageSize,
    buildInput: (offset) => buildQueryInput(filters, offset),
    selectRows: (page) => page.users,
    noun: '用户',
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
            <h1 className="text-2xl font-semibold tracking-tight">用户管理</h1>
            {!isLoading && <span className="text-lg font-normal text-muted-foreground">{total.toLocaleString()}</span>}
          </div>
          <div className="flex items-center gap-2">
            <InputGroup className="h-9 w-full sm:w-56">
              <InputGroupAddon>
                <SearchIcon className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="搜索用户名或邮箱"
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
              <MailIcon data-icon /> 邀请作者
            </Button>
          </div>
        </header>

        <UsersTable rows={rows} config={config} isLoading={isLoading} />

        {/* Sentinel for infinite scroll */}
        {hasNextPage && <div ref={sentinelRef} className="h-1" />}
        {/* Bottom status */}
        <AdminInfiniteListFooter
          noun="用户"
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
