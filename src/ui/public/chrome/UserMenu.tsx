import { BellIcon, LogOutIcon, MessageSquareIcon, MonitorIcon, SettingsIcon, UserIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import type { HeaderCurrentUser } from '@/ui/public/chrome/Header'

import { useLogout } from '@/client/hooks/use-logout'
import { useUnreadNotificationCount } from '@/client/hooks/use-notifications'
import { avatarImageUrl } from '@/shared/utils/avatar'
import { roleLabel } from '@/shared/utils/roles'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Button } from '@/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu'
import { NotificationsDrawer } from '@/ui/shared/notifications/NotificationsDrawer'

interface Props {
  currentUser: HeaderCurrentUser
  logoutRedirectTo: string
}

// User menu in the public chrome's site-nav; a single avatar-button trigger
// nests next to the other site-nav links without taking a full row.
export function UserMenu({ currentUser, logoutRedirectTo }: Props) {
  const logout = useLogout()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const unreadCount = useUnreadNotificationCount()
  const initial = (currentUser.name || '?').slice(0, 1).toUpperCase()
  const canEnterAdmin = currentUser.role === 'admin' || currentUser.role === 'author'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="relative size-9 rounded-full" aria-label="用户菜单">
            <Avatar className="size-8">
              <AvatarImage src={avatarImageUrl(currentUser.id)} alt={currentUser.name} />
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            {unreadCount > 0 ? (
              <span
                className="absolute top-0 right-0 size-2.5 rounded-full bg-destructive ring-2 ring-background"
                aria-hidden
              />
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{currentUser.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{roleLabel(currentUser.role)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setNotificationsOpen(true)}>
          <BellIcon /> 消息通知
          {unreadCount > 0 ? (
            <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none font-medium text-primary-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <Link to="/admin/me/comments" prefetch="intent">
              <MessageSquareIcon /> 我的评论
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link to="/admin/me/sessions" prefetch="intent">
              <MonitorIcon /> 登录设备
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link to="/admin/me/profile" prefetch="intent">
              <UserIcon /> 个人信息
            </Link>
          }
        />
        {canEnterAdmin && (
          <DropdownMenuItem
            render={
              <Link to="/admin/" prefetch="intent">
                <SettingsIcon /> 管理后台
              </Link>
            }
          />
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void logout(logoutRedirectTo)}>
          <LogOutIcon /> 登出
        </DropdownMenuItem>
      </DropdownMenuContent>
      <NotificationsDrawer
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        isAdmin={currentUser.role === 'admin'}
      />
    </DropdownMenu>
  )
}
