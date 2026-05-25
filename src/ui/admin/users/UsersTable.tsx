import {
  CheckCheckIcon,
  EyeIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  VolumeOffIcon,
  Volume2Icon,
} from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router'

import type { SiteIdentitySettings } from '@/shared/config/types'
import type { AdminUserDto } from '@/shared/types/users'

import { formatLocalDate } from '@/shared/utils/formatter'
import { roleLabel } from '@/shared/utils/roles'
import { safeHref } from '@/shared/utils/safe-url'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { Checkbox } from '@/ui/components/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Skeleton } from '@/ui/components/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table'
import { maskIp, maskUa } from '@/ui/lib/mask'

const DATE_FORMAT = 'yyyy-LL-dd HH:mm'

interface UsersTableProps {
  rows: AdminUserDto[]
  config: SiteIdentitySettings
  selected: Record<string, boolean>
  allRowsSelected: boolean
  isLoading: boolean
  onToggleAll: (value: boolean) => void
  onSelectedChange: (id: string, value: boolean) => void
  onMuteToggle: (user: AdminUserDto) => void
  onSoftDelete: (user: AdminUserDto) => void
  onRestore: (user: AdminUserDto) => void
  onBulkApproveOne: (user: AdminUserDto) => void
  onBulkDeleteCommentsOne: (user: AdminUserDto) => void
}

// Headless presentation slice of the users page. Owns the markup for
// the table chrome + per-row decisions, but holds none of the
// fetcher / dispatch / confirm-dialog state — that lives in
// `UsersView`. Splitting the table out lets future row tweaks (a new
// column, an extra dropdown action) land in this file without
// touching the orchestrator's effect graph.
export function UsersTable({
  rows,
  config,
  selected,
  allRowsSelected,
  isLoading,
  onToggleAll,
  onSelectedChange,
  onMuteToggle,
  onSoftDelete,
  onRestore,
  onBulkApproveOne,
  onBulkDeleteCommentsOne,
}: UsersTableProps) {
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 px-3">
              <Checkbox
                checked={allRowsSelected}
                onCheckedChange={(value) => onToggleAll(value === true)}
                aria-label="全选"
              />
            </TableHead>
            <TableHead>用户</TableHead>
            <TableHead className="hidden md:table-cell">联系方式</TableHead>
            <TableHead className="hidden lg:table-cell">最近活动</TableHead>
            <TableHead className="text-center">评论</TableHead>
            <TableHead className="text-center">角色</TableHead>
            <TableHead className="text-center">状态</TableHead>
            <TableHead className="w-12 pr-4 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <UsersSkeleton />
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="p-0">
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
            rows.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                config={config}
                selected={!!selected[user.id]}
                onSelectedChange={(value) => onSelectedChange(user.id, value)}
                onMuteToggle={() => onMuteToggle(user)}
                onSoftDelete={() => onSoftDelete(user)}
                onRestore={() => onRestore(user)}
                onBulkApprove={() => onBulkApproveOne(user)}
                onBulkDeleteComments={() => onBulkDeleteCommentsOne(user)}
              />
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  )
}

interface UserRowProps {
  user: AdminUserDto
  config: SiteIdentitySettings
  selected: boolean
  onSelectedChange: (value: boolean) => void
  onMuteToggle: () => void
  onSoftDelete: () => void
  onRestore: () => void
  onBulkApprove: () => void
  onBulkDeleteComments: () => void
}

// `React.memo` is meaningful here: the parent re-renders on every
// fetcher state change (including unrelated ones such as a debounced
// search keystroke), but a row only needs to reconcile when its own
// `user` / `selected` / handler identities change. The handlers
// themselves are stable as long as the parent wraps them in
// `useCallback` (or recomputes them only when `user` rotates), which
// matches the orchestrator below.
const UserRow = memo(function UserRow({
  user,
  config,
  selected,
  onSelectedChange,
  onMuteToggle,
  onSoftDelete,
  onRestore,
  onBulkApprove,
  onBulkDeleteComments,
}: UserRowProps) {
  const initial = (user.name || user.email || '?').slice(0, 1).toUpperCase()
  const linkHref = safeHref(user.link)
  return (
    <TableRow data-state={selected ? 'selected' : undefined}>
      <TableCell className="px-3">
        <Checkbox
          checked={selected}
          onCheckedChange={(value) => onSelectedChange(value === true)}
          aria-label={`选择 ${user.name}`}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-9 shrink-0">
            <AvatarImage src={`/images/avatar/${user.id}.png`} alt={user.name} />
            <AvatarFallback className="bg-muted text-xs font-semibold">{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                to={`/admin/security/users/${user.id}`}
                prefetch="intent"
                className="truncate font-medium hover:underline"
              >
                {user.name}
              </Link>
              {user.badgeName && (
                <Badge
                  className="border-transparent"
                  style={{
                    backgroundColor: user.badgeColor || 'var(--brand)',
                    // Honour the admin-set text-colour override; fall
                    // back to white for legacy rows without one — the
                    // public site applies a proper WCAG pick, this
                    // table just needs a non-jarring default.
                    color: user.badgeTextColor || '#fff',
                  }}
                >
                  {user.badgeName}
                </Badge>
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground md:hidden">{user.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <div className="flex flex-col gap-0.5 text-sm">
          <span className="truncate">{user.email}</span>
          {linkHref && (
            <a
              href={linkHref}
              target="_blank"
              rel="nofollow noreferrer"
              className="truncate text-xs text-muted-foreground hover:text-foreground"
            >
              {linkHref}
            </a>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {user.lastCommentAt && (
            <span>评论：{formatLocalDate(new Date(user.lastCommentAt), DATE_FORMAT, config)}</span>
          )}
          {!!user.lastIp && <span>IP：{maskIp(user.lastIp)}</span>}
          {!!user.lastUa && <span className="max-w-xs truncate">UA：{maskUa(user.lastUa)}</span>}
        </div>
      </TableCell>
      <TableCell className="text-center">
        <Link to={`/admin/comments?userId=${user.id}`} className="text-sm font-medium hover:underline">
          {user.commentCount}
        </Link>
        {user.pendingCount > 0 && <div className="mt-0.5 text-xs text-destructive">{user.pendingCount} 待审</div>}
      </TableCell>
      <TableCell className="text-center">
        {user.role === null ? (
          <Badge variant="outline">匿名</Badge>
        ) : (
          <Badge variant="secondary">{roleLabel(user.role)}</Badge>
        )}
      </TableCell>
      <TableCell className="text-center">
        {user.deletedAt ? (
          <Badge variant="outline" className="text-muted-foreground">
            已删除
          </Badge>
        ) : user.isMuted ? (
          <Badge variant="destructive">已禁言</Badge>
        ) : (
          <Badge variant="secondary">正常</Badge>
        )}
      </TableCell>
      <TableCell className="pr-4 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" variant="ghost" size="icon" aria-label="更多操作">
                <MoreHorizontalIcon />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              render={
                <Link to={`/admin/security/users/${user.id}`}>
                  <EyeIcon /> 查看详情
                </Link>
              }
            />
            <DropdownMenuItem
              render={
                <Link to={`/admin/comments?userId=${user.id}`}>
                  <MessageSquareIcon /> 查看其评论
                </Link>
              }
            />
            {user.role !== 'admin' && (
              <DropdownMenuItem onClick={onMuteToggle}>
                {user.isMuted ? (
                  <>
                    <Volume2Icon /> 解除禁言
                  </>
                ) : (
                  <>
                    <VolumeOffIcon /> 禁言
                  </>
                )}
              </DropdownMenuItem>
            )}
            {user.pendingCount > 0 && (
              <DropdownMenuItem onClick={onBulkApprove}>
                <CheckCheckIcon /> 通过全部待审 ({user.pendingCount})
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {user.deletedAt ? (
              <DropdownMenuItem onClick={onRestore}>
                <RotateCcwIcon /> 恢复用户
              </DropdownMenuItem>
            ) : (
              user.role !== 'admin' && (
                <DropdownMenuItem variant="destructive" onClick={onSoftDelete}>
                  <Trash2Icon /> 软删除用户
                </DropdownMenuItem>
              )
            )}
            {user.commentCount > 0 && user.role !== 'admin' && (
              <DropdownMenuItem variant="destructive" onClick={onBulkDeleteComments}>
                <Trash2Icon /> 删除其全部评论
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
})

function UsersSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        // Skeleton rows — identical placeholders, swapped wholesale on load.
        // oxlint-disable-next-line react/no-array-index-key
        <TableRow key={i}>
          <TableCell className="px-3">
            <Skeleton className="size-4 rounded" />
          </TableCell>
          <TableCell colSpan={7}>
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
