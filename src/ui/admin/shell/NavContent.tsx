import {
  FileTextIcon,
  ImagesIcon,
  LibraryIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  PlusIcon,
  ShieldIcon,
} from 'lucide-react'

import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { hasAtLeast } from '@/shared/utils/roles'
import { NavMenuItem } from '@/ui/admin/shell/NavMenuItem'
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuBadge } from '@/ui/components/sidebar'

interface NavContentProps {
  role: AdminShellProps['currentUser']['role']
  pendingCommentCount?: number
  userCount?: number
}

export function NavContent({ role, pendingCommentCount = 0, userCount }: NavContentProps) {
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
            <NavMenuItem.Collapsible id="posts-submenu" paths={['/admin/posts']}>
              <NavMenuItem.CollapsibleItem
                ariaLabel="展开文章子菜单"
                action={
                  <NavMenuItem.Link
                    to="/editor/post/new"
                    className="absolute top-1/2 right-1 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-xl p-0 text-sidebar-foreground opacity-0 transition-opacity group-hover/menu-item:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100"
                  >
                    <PlusIcon className="size-4" />
                  </NavMenuItem.Link>
                }
              >
                <NotebookPenIcon />
                <NavMenuItem.Label>文章管理</NavMenuItem.Label>
              </NavMenuItem.CollapsibleItem>

              <NavMenuItem.CollapsibleMenu>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/posts" className="pl-11" end>
                    <NavMenuItem.Label>全部文章</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/posts?status=draft" className="pl-11">
                    <NavMenuItem.Label>草稿箱</NavMenuItem.Label>
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

          {showAuthorItems && (
            <NavMenuItem.Collapsible
              id="taxonomy-submenu"
              paths={['/admin/taxonomy/categories', '/admin/taxonomy/tags', '/admin/taxonomy/friends']}
            >
              <NavMenuItem.CollapsibleItem ariaLabel="展开分门别类子菜单">
                <LibraryIcon />
                <NavMenuItem.Label>分门别类</NavMenuItem.Label>
              </NavMenuItem.CollapsibleItem>

              <NavMenuItem.CollapsibleMenu>
                {showAdminItems && (
                  <NavMenuItem>
                    <NavMenuItem.Link to="/admin/taxonomy/categories" className="pl-11">
                      <NavMenuItem.Label>分类管理</NavMenuItem.Label>
                    </NavMenuItem.Link>
                  </NavMenuItem>
                )}
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/taxonomy/tags" className="pl-11">
                    <NavMenuItem.Label>标签管理</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                {showAdminItems && (
                  <NavMenuItem>
                    <NavMenuItem.Link to="/admin/taxonomy/friends" className="pl-11">
                      <NavMenuItem.Label>友链管理</NavMenuItem.Label>
                    </NavMenuItem.Link>
                  </NavMenuItem>
                )}
              </NavMenuItem.CollapsibleMenu>
            </NavMenuItem.Collapsible>
          )}

          {showAuthorItems && (
            <NavMenuItem.Collapsible
              id="media-submenu"
              paths={[
                '/admin/library/images',
                '/admin/library/music',
                '/admin/library/branding',
                '/admin/library/fonts',
              ]}
            >
              <NavMenuItem.CollapsibleItem ariaLabel="展开媒体管理子菜单">
                <ImagesIcon />
                <NavMenuItem.Label>媒体管理</NavMenuItem.Label>
              </NavMenuItem.CollapsibleItem>

              <NavMenuItem.CollapsibleMenu>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/library/images" className="pl-11">
                    <NavMenuItem.Label>图片管理</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/library/music" className="pl-11">
                    <NavMenuItem.Label>音乐管理</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                {showAdminItems && (
                  <NavMenuItem>
                    <NavMenuItem.Link to="/admin/library/branding" className="pl-11">
                      <NavMenuItem.Label>品牌素材</NavMenuItem.Label>
                    </NavMenuItem.Link>
                  </NavMenuItem>
                )}
                {showAdminItems && (
                  <NavMenuItem>
                    <NavMenuItem.Link to="/admin/library/fonts" className="pl-11">
                      <NavMenuItem.Label>网站字体</NavMenuItem.Label>
                    </NavMenuItem.Link>
                  </NavMenuItem>
                )}
              </NavMenuItem.CollapsibleMenu>
            </NavMenuItem.Collapsible>
          )}

          {showAdminItems && (
            <NavMenuItem.Collapsible
              id="security-submenu"
              paths={['/admin/security/sessions', '/admin/security/audit-log', '/admin/security/users']}
            >
              <NavMenuItem.CollapsibleItem ariaLabel="展开安全管理子菜单">
                <ShieldIcon />
                <NavMenuItem.Label>安全管理</NavMenuItem.Label>
              </NavMenuItem.CollapsibleItem>

              <NavMenuItem.CollapsibleMenu>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/security/sessions" className="pl-11" end>
                    <NavMenuItem.Label>会话管理</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/security/audit-log" className="pl-11">
                    <NavMenuItem.Label>审计日志</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/security/users" className="pl-11" activeMatch="subpath">
                    <NavMenuItem.Label>用户管理</NavMenuItem.Label>
                  </NavMenuItem.Link>
                  {userCount != null && <SidebarMenuBadge>{userCount}</SidebarMenuBadge>}
                </NavMenuItem>
              </NavMenuItem.CollapsibleMenu>
            </NavMenuItem.Collapsible>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
