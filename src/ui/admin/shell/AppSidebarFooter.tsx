import { ChevronsUpDownIcon, InfoIcon, LogOutIcon, MessageSquareIcon, MonitorIcon, UserIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

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

interface AppSidebarFooterProps {
  className?: string
  id: string
  name: string
  email: string
}

export function AppSidebarFooter({ className, id, name, email }: AppSidebarFooterProps) {
  const [versionOpen, setVersionOpen] = useState(false)
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
                  aria-label="用户菜单"
                >
                  <Avatar className="size-8">
                    {id ? <AvatarImage src={`/images/avatar/${id}.png`} alt={name} /> : null}
                    <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
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
                  {id ? <AvatarImage src={`/images/avatar/${id}.png`} alt={name} /> : null}
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
              <DropdownMenuItem
                className="my-0.5 rounded-xl px-3 py-2 text-sm"
                render={
                  <a href="/admin/signin?action=logout&redirect_to=/">
                    <LogOutIcon className="mr-2 size-4" />
                    登出
                  </a>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
          <VersionDialog open={versionOpen} onOpenChange={setVersionOpen} />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  )
}
