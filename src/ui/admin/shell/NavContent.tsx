import {
  FileTextIcon,
  FolderIcon,
  ImagesIcon,
  LinkIcon,
  MessageSquareIcon,
  Music2Icon,
  NotebookPenIcon,
  PlusIcon,
  SmartphoneIcon,
  TagsIcon,
  UsersIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { hasAtLeast } from '@/shared/utils/roles'
import { NavMenuItem } from '@/ui/admin/shell/NavMenuItem'
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuBadge } from '@/ui/components/sidebar'

interface NavContentProps {
  role: AdminShellProps['currentUser']['role']
  pendingCommentCount?: number
  userCount?: number
}

const POSTS_EXPANDED_KEY = 'admin-nav-posts-expanded'

function useLocalStorageBoolean(key: string, defaultValue = false) {
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key)
      if (stored !== null) {
        setValue(stored === 'true')
      }
    } catch {
      // ignore
    }
  }, [key])

  const setStored = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        try {
          window.localStorage.setItem(key, String(resolved))
        } catch {
          // ignore
        }
        return resolved
      })
    },
    [key],
  )

  return [value, setStored] as const
}

export function NavContent({ role, pendingCommentCount = 0, userCount }: NavContentProps) {
  const [postsExpanded, setPostsExpanded] = useLocalStorageBoolean(POSTS_EXPANDED_KEY, false)

  if (!role) {
    return null
  }

  const showAuthorItems = hasAtLeast(role, 'author')
  const showAdminItems = hasAtLeast(role, 'admin')

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {showAuthorItems && (
            <NavMenuItem.Collapsible expanded={postsExpanded} id="posts-submenu" onExpandedChange={setPostsExpanded}>
              <NavMenuItem.CollapsibleItem ariaLabel="展开文章子菜单">
                <NavMenuItem.Link
                  to="/admin/posts"
                  activeOnSubpath
                  className="[&>svg]:transition-opacity group-hover/menu-item:[&>svg]:opacity-0"
                >
                  <NotebookPenIcon />
                  <NavMenuItem.Label>文章管理</NavMenuItem.Label>
                </NavMenuItem.Link>
                <NavMenuItem.Link
                  to="/editor/post/new"
                  className="absolute top-1/2 right-1 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-md p-0 text-sidebar-foreground opacity-0 transition-opacity group-hover/menu-item:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100"
                >
                  <PlusIcon className="size-4" />
                </NavMenuItem.Link>
              </NavMenuItem.CollapsibleItem>

              <NavMenuItem.CollapsibleMenu>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/posts" className="pl-11" end>
                    <NavMenuItem.Label>全部文章</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/posts?status=draft" className="pl-11">
                    <NavMenuItem.Label>草稿</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/posts?status=published" className="pl-11">
                    <NavMenuItem.Label>已发布</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
              </NavMenuItem.CollapsibleMenu>
            </NavMenuItem.Collapsible>
          )}

          {showAdminItems && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/pages">
                <FileTextIcon />
                <NavMenuItem.Label>页面管理</NavMenuItem.Label>
              </NavMenuItem.Link>
            </NavMenuItem>
          )}

          {showAdminItems && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/comments">
                <MessageSquareIcon />
                <NavMenuItem.Label>评论管理</NavMenuItem.Label>
              </NavMenuItem.Link>
              {pendingCommentCount > 0 && (
                <SidebarMenuBadge className="bg-status-error-bg text-status-error-fg">
                  {pendingCommentCount}
                </SidebarMenuBadge>
              )}
            </NavMenuItem>
          )}

          {showAdminItems && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/categories">
                <FolderIcon />
                <NavMenuItem.Label>分类管理</NavMenuItem.Label>
              </NavMenuItem.Link>
            </NavMenuItem>
          )}

          {showAuthorItems && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/tags">
                <TagsIcon />
                <NavMenuItem.Label>标签管理</NavMenuItem.Label>
              </NavMenuItem.Link>
            </NavMenuItem>
          )}

          {showAdminItems && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/friends">
                <LinkIcon />
                <NavMenuItem.Label>友链管理</NavMenuItem.Label>
              </NavMenuItem.Link>
            </NavMenuItem>
          )}

          {showAuthorItems && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/library/images">
                <ImagesIcon />
                <NavMenuItem.Label>图片管理</NavMenuItem.Label>
              </NavMenuItem.Link>
            </NavMenuItem>
          )}

          {showAuthorItems && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/library/music">
                <Music2Icon />
                <NavMenuItem.Label>音乐管理</NavMenuItem.Label>
              </NavMenuItem.Link>
            </NavMenuItem>
          )}

          {showAdminItems && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/users" activeOnSubpath>
                <UsersIcon />
                <NavMenuItem.Label>用户管理</NavMenuItem.Label>
              </NavMenuItem.Link>
              {userCount != null && <SidebarMenuBadge>{userCount}</SidebarMenuBadge>}
            </NavMenuItem>
          )}

          {showAdminItems && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/security/sessions">
                <SmartphoneIcon />
                <NavMenuItem.Label>会话管理</NavMenuItem.Label>
              </NavMenuItem.Link>
            </NavMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
