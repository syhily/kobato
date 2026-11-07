import {
  BellIcon,
  ChevronsUpDownIcon,
  InfoIcon,
  LogOutIcon,
  MessageSquareIcon,
  MonitorIcon,
  UserIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useLogout } from '@/client/hooks/use-logout'
import { avatarImageUrl } from '@/shared/utils/avatar'
import { VersionDialog } from '@/ui/admin/shell/VersionDialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu'
import { SidebarFooter, SidebarMenu, SidebarMenuItem } from '@/ui/components/sidebar'
import { warmNotificationsDrawerChunk } from '@/ui/shared/notifications/LazyNotificationsDrawer'
import { NotificationBadge } from '@/ui/shared/notifications/NotificationBadge'

interface AppSidebarFooterProps {
  className?: string
  id: string
  name: string
  email: string
  /** Supplied by the shell's single count owner — never subscribe here. */
  unreadCount: number
  onOpenNotifications: () => void
}

export function AppSidebarFooter({
  className,
  id,
  name,
  email,
  unreadCount,
  onOpenNotifications,
}: AppSidebarFooterProps) {
  const [versionOpen, setVersionOpen] = useState(false)
  const logout = useLogout()
  const initial = (name || email || '?').slice(0, 1).toUpperCase()

  return (
    <SidebarFooter className={className}>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  aria-label={unreadCount > 0 ? `用户菜单，${unreadCount} 条未读消息` : '用户菜单'}
                >
                  <span className="relative">
                    <Avatar className="size-8">
                      {id ? <AvatarImage src={avatarImageUrl(id)} alt={name} /> : null}
                      <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                    {unreadCount > 0 ? (
                      <span
                        className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-destructive ring-2 ring-sidebar"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">{email}</span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
                </button>
              }
            />
            <DropdownMenuContent align="start" sideOffset={8} className="min-w-[var(--anchor-width)] px-3 pt-3">
              <DropdownMenuLabel className="flex items-center gap-3 rounded-xl p-3">
                <Avatar className="size-10">
                  {id ? <AvatarImage src={avatarImageUrl(id)} alt={name} /> : null}
                  <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-semibold">{name}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem
                className="my-0.5 rounded-xl px-3 py-2 text-sm"
                onClick={() => onOpenNotifications()}
                onPointerEnter={warmNotificationsDrawerChunk}
              >
                <BellIcon className="mr-2 size-4" />
                消息通知
                <NotificationBadge count={unreadCount} />
              </DropdownMenuItem>
              <DropdownMenuItem
                className="my-0.5 rounded-xl px-3 py-2 text-sm"
                render={
                  <Link to="/admin/me/profile" prefetch="intent">
                    <UserIcon className="mr-2 size-4" />
                    个人信息
                  </Link>
                }
              />
              <DropdownMenuItem
                className="my-0.5 rounded-xl px-3 py-2 text-sm"
                render={
                  <Link to="/admin/me/comments" prefetch="intent">
                    <MessageSquareIcon className="mr-2 size-4" />
                    我的评论
                  </Link>
                }
              />
              <DropdownMenuItem
                className="my-0.5 rounded-xl px-3 py-2 text-sm"
                render={
                  <Link to="/admin/me/sessions" prefetch="intent">
                    <MonitorIcon className="mr-2 size-4" />
                    登录设备
                  </Link>
                }
              />
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem className="my-0.5 rounded-xl px-3 py-2 text-sm" onClick={() => setVersionOpen(true)}>
                <InfoIcon className="mr-2 size-4" />
                系统版本
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem className="my-0.5 rounded-xl px-3 py-2 text-sm" onClick={() => void logout('/')}>
                <LogOutIcon className="mr-2 size-4" />
                登出
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <VersionDialog open={versionOpen} onOpenChange={setVersionOpen} />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  )
}
