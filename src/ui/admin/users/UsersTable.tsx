import type { FragmentInstance, Ref } from 'react'

import { SearchIcon } from 'lucide-react'
import { Fragment, memo } from 'react'
import { Link, useNavigate } from 'react-router'

import type { SiteIdentitySettings } from '@/shared/config/types'
import type { AdminUserDto } from '@/shared/contracts/users'

import { avatarImageUrl } from '@/shared/utils/avatar'
import { formatLocalDate, formatShowDate } from '@/shared/utils/formatter'
import { ROLE_LABEL_KEYS } from '@/shared/utils/roles'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Skeleton } from '@/ui/components/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'
import { skeletonKeys } from '@/ui/lib/skeleton-keys'
import { useChromeClock } from '@/ui/public/chrome/use-chrome-clock'

const DATE_FORMAT = 'yyyy-LL-dd'

interface UsersTableProps {
  rows: AdminUserDto[]
  config: SiteIdentitySettings
  isLoading: boolean
  /** Fragment ref mounted on the last row — the infinite-scroll sentinel observes it. */
  sentinelRef?: Ref<FragmentInstance>
}

export function UsersTable({ rows, config, isLoading, sentinelRef }: UsersTableProps) {
  const { t } = useI18n()
  // One clock for the whole table so the relative "registered" dates share the render
  // instant: the root loader's `nowIso` during SSR + hydration, the live clock after mount
  // (a midnight rollover would otherwise mismatch).
  const now = useChromeClock()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('admin.users.table.user')}
          </TableHead>
          <TableHead className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('admin.users.table.role')}
          </TableHead>
          <TableHead className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('admin.users.table.status')}
          </TableHead>
          <TableHead className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('admin.users.table.registered')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <UsersSkeleton />
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="p-0">
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t('admin.users.empty')}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </TableCell>
          </TableRow>
        ) : (
          rows.map((user, index) =>
            index === rows.length - 1 ? (
              <Fragment key={user.id} ref={sentinelRef}>
                <UserRow user={user} config={config} now={now} />
              </Fragment>
            ) : (
              <UserRow key={user.id} user={user} config={config} now={now} />
            ),
          )
        )}
      </TableBody>
    </Table>
  )
}

interface UserRowProps {
  user: AdminUserDto
  config: SiteIdentitySettings
  /** Stable render clock (root `nowIso` on SSR/hydration) for the relative date. */
  now: Date
}

const UserRow = memo(function UserRow({ user, config, now }: UserRowProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const initial = (user.name || user.email || '?').slice(0, 1).toUpperCase()
  const detailPath = `/admin/security/users/${user.id}`

  const statusText = user.deletedAt
    ? t('admin.users.status.deleted')
    : user.isMuted
      ? t('admin.users.status.muted')
      : t('admin.users.status.normal')
  const statusClass = user.deletedAt ? 'text-muted-foreground' : user.isMuted ? 'text-destructive' : 'text-foreground'

  const createdDate = new Date(user.createdAt)

  return (
    <TableRow
      className="cursor-pointer"
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest('a, button, [role="menuitem"]')) {
          return
        }
        void navigate(detailPath)
      }}
    >
      <TableCell className="px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-10 shrink-0">
            <AvatarImage src={avatarImageUrl(user.id)} alt={user.name} />
            <AvatarFallback className="bg-muted text-xs font-semibold">{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <Link
              to={detailPath}
              prefetch="intent"
              onClick={(e) => e.stopPropagation()}
              className="block truncate font-medium hover:underline"
            >
              {user.name || t('common.role.anonymous')}
            </Link>
            <div className="truncate text-sm text-muted-foreground">{user.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4 py-4">
        <span className="text-sm">
          {user.role === null ? t('common.role.anonymous') : t(ROLE_LABEL_KEYS[user.role])}
        </span>
      </TableCell>
      <TableCell className="px-4 py-4">
        <span className={cn('text-sm', statusClass)}>{statusText}</span>
      </TableCell>
      <TableCell className="px-4 py-4">
        <div>
          <div className="text-sm">{formatLocalDate(createdDate, DATE_FORMAT, config)}</div>
          <div className="text-xs text-muted-foreground">{formatShowDate(createdDate, config, now)}</div>
        </div>
      </TableCell>
    </TableRow>
  )
})

function UsersSkeleton() {
  return (
    <>
      {skeletonKeys(5).map((key) => (
        <TableRow key={key}>
          <TableCell colSpan={4} className="py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
