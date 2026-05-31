import { SearchIcon } from 'lucide-react'
import { memo } from 'react'
import { Link, useNavigate } from 'react-router'

import type { SiteIdentitySettings } from '@/shared/config/types'
import type { AdminUserDto } from '@/shared/types/users'

import { formatLocalDate } from '@/shared/utils/formatter'
import { roleLabel } from '@/shared/utils/roles'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Skeleton } from '@/ui/components/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table'
import { cn } from '@/ui/lib/cn'

const DATE_FORMAT = 'yyyy-LL-dd'

interface UsersTableProps {
  rows: AdminUserDto[]
  config: SiteIdentitySettings
  isLoading: boolean
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffMin < 1) {
    return '刚刚'
  }
  if (diffMin < 60) {
    return `${diffMin} 分钟前`
  }
  if (diffHour < 24) {
    return `${diffHour} 小时前`
  }
  if (diffDay < 7) {
    return `${diffDay} 天前`
  }
  if (diffDay < 30) {
    return `${Math.floor(diffDay / 7)} 周前`
  }
  if (diffDay < 365) {
    return `${Math.floor(diffDay / 30)} 个月前`
  }
  return `${Math.floor(diffDay / 365)} 年前`
}

export function UsersTable({ rows, config, isLoading }: UsersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            用户
          </TableHead>
          <TableHead className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            角色
          </TableHead>
          <TableHead className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            状态
          </TableHead>
          <TableHead className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            注册时间
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
                  <EmptyTitle>未找到用户</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </TableCell>
          </TableRow>
        ) : (
          rows.map((user) => <UserRow key={user.id} user={user} config={config} />)
        )}
      </TableBody>
    </Table>
  )
}

interface UserRowProps {
  user: AdminUserDto
  config: SiteIdentitySettings
}

const UserRow = memo(function UserRow({ user, config }: UserRowProps) {
  const navigate = useNavigate()
  const initial = (user.name || user.email || '?').slice(0, 1).toUpperCase()
  const detailPath = `/admin/security/users/${user.id}`

  const statusText = user.deletedAt ? '已删除' : user.isMuted ? '已禁言' : '正常'
  const statusClass = user.deletedAt ? 'text-muted-foreground' : user.isMuted ? 'text-destructive' : 'text-foreground'

  const createdDate = new Date(user.createdAt)

  return (
    <TableRow
      className="cursor-pointer"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button, [role="menuitem"]')) {
          return
        }
        void navigate(detailPath)
      }}
    >
      <TableCell className="px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-10 shrink-0">
            <AvatarImage src={`/images/avatar/${user.id}.png`} alt={user.name} />
            <AvatarFallback className="bg-muted text-xs font-semibold">{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <Link
              to={detailPath}
              prefetch="intent"
              onClick={(e) => e.stopPropagation()}
              className="block truncate font-medium hover:underline"
            >
              {user.name || '匿名'}
            </Link>
            <div className="truncate text-sm text-muted-foreground">{user.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4 py-4">
        <span className="text-sm">{user.role === null ? '匿名' : roleLabel(user.role)}</span>
      </TableCell>
      <TableCell className="px-4 py-4">
        <span className={cn('text-sm', statusClass)}>{statusText}</span>
      </TableCell>
      <TableCell className="px-4 py-4">
        <div>
          <div className="text-sm">{formatLocalDate(createdDate, DATE_FORMAT, config)}</div>
          <div className="text-xs text-muted-foreground">{formatRelativeTime(createdDate)}</div>
        </div>
      </TableCell>
    </TableRow>
  )
})

function UsersSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        // oxlint-disable-next-line react/no-array-index-key
        <TableRow key={i}>
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
