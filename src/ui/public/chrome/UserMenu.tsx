import { LogOutIcon, MessageSquareIcon, MonitorIcon, SettingsIcon, UserIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { HeaderCurrentUser } from '@/ui/public/chrome/Header'

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

interface Props {
  currentUser: HeaderCurrentUser
  logoutQuery: string
}

// User menu in the public chrome's site-nav; a single avatar-button trigger
// nests next to the other site-nav links without taking a full row.
export function UserMenu({ currentUser, logoutQuery }: Props) {
  const initial = (currentUser.name || '?').slice(0, 1).toUpperCase()
  const canEnterAdmin = currentUser.role === 'admin' || currentUser.role === 'author'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label="用户菜单">
            <Avatar className="size-8">
              <AvatarImage src={avatarImageUrl(currentUser.id)} alt={currentUser.name} />
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{currentUser.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{roleLabel(currentUser.role)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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
        <DropdownMenuItem
          render={
            <a href={`/admin/signin?${logoutQuery}`}>
              <LogOutIcon /> 登出
            </a>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
