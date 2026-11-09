import {
  AtSignIcon,
  FileTextIcon,
  ImagesIcon,
  LibraryIcon,
  ListChecksIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  PlusIcon,
  ShieldIcon,
} from 'lucide-react'
import { useLocation } from 'react-router'

import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { hasAtLeast } from '@/shared/utils/roles'
import { NavMenuItem } from '@/ui/admin/shell/NavMenuItem'
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuBadge } from '@/ui/components/sidebar'
import { useI18n } from '@/ui/lib/I18nProvider'

interface NavContentProps {
  role: AdminShellProps['currentUser']['role']
  pendingCommentCount?: number
  pendingWebmentionCount?: number
  userCount?: number
}

export function NavContent({ role, pendingCommentCount = 0, pendingWebmentionCount = 0, userCount }: NavContentProps) {
  const { t } = useI18n()
  // The posts status submenu tracks the list's ?status= param (PostsView keeps the URL in sync with its pills).
  const { pathname, search } = useLocation()
  const onPostsList = pathname === '/admin/posts'
  const rawPostsStatus = new URLSearchParams(search).get('status')
  // `hidden` is the pre-rename spelling of `unlisted` on bookmarked deep links.
  const postsStatus = rawPostsStatus === 'hidden' ? 'unlisted' : rawPostsStatus
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
                ariaLabel={t('admin.shell.nav.expandPosts')}
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
                <NavMenuItem.Label>{t('meta.title.admin.posts')}</NavMenuItem.Label>
              </NavMenuItem.CollapsibleItem>

              <NavMenuItem.CollapsibleMenu>
                <NavMenuItem>
                  <NavMenuItem.Link
                    to="/admin/posts"
                    className="pl-11"
                    isActive={onPostsList && (postsStatus === null || postsStatus === 'all')}
                  >
                    <NavMenuItem.Label>{t('admin.shell.nav.allPosts')}</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/posts?status=draft" className="pl-11" isActive={postsStatus === 'draft'}>
                    <NavMenuItem.Label>{t('admin.shell.nav.drafts')}</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                <NavMenuItem>
                  <NavMenuItem.Link
                    to="/admin/posts?status=published"
                    className="pl-11"
                    isActive={postsStatus === 'published'}
                  >
                    <NavMenuItem.Label>{t('admin.shell.nav.published')}</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                <NavMenuItem>
                  <NavMenuItem.Link
                    to="/admin/posts?status=deleted"
                    className="pl-11"
                    isActive={postsStatus === 'deleted'}
                  >
                    <NavMenuItem.Label>{t('admin.shell.nav.deleted')}</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
              </NavMenuItem.CollapsibleMenu>
            </NavMenuItem.Collapsible>
          )}

          {showAdminItems && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/pages">
                <FileTextIcon />
                <NavMenuItem.Label>{t('meta.title.admin.pages')}</NavMenuItem.Label>
              </NavMenuItem.Link>
              <NavMenuItem.Link
                to="/editor/page/new"
                aria-label={t('meta.title.editor.pageNew')}
                className="absolute top-1/2 right-1 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-xl p-0 text-sidebar-foreground opacity-0 transition-opacity group-hover/menu-item:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100"
              >
                <PlusIcon className="size-4" />
              </NavMenuItem.Link>
            </NavMenuItem>
          )}

          {showAdminItems && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/comments">
                <MessageSquareIcon />
                <NavMenuItem.Label>{t('meta.title.admin.comments')}</NavMenuItem.Label>
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
              <NavMenuItem.Link to="/admin/webmentions" tooltip="Webmention">
                <AtSignIcon />
                <NavMenuItem.Label>{t('admin.shell.nav.interactions')}</NavMenuItem.Label>
              </NavMenuItem.Link>
              {pendingWebmentionCount > 0 && (
                <SidebarMenuBadge className="bg-status-error-bg text-status-error-fg">
                  {pendingWebmentionCount}
                </SidebarMenuBadge>
              )}
            </NavMenuItem>
          )}

          {showAdminItems && (
            <NavMenuItem>
              <NavMenuItem.Link to="/admin/tasks">
                <ListChecksIcon />
                <NavMenuItem.Label>{t('meta.title.admin.tasks')}</NavMenuItem.Label>
              </NavMenuItem.Link>
            </NavMenuItem>
          )}

          {showAuthorItems && (
            <NavMenuItem.Collapsible
              id="taxonomy-submenu"
              paths={['/admin/taxonomy/categories', '/admin/taxonomy/tags', '/admin/taxonomy/friends']}
            >
              <NavMenuItem.CollapsibleItem ariaLabel={t('admin.shell.nav.expandTaxonomy')}>
                <LibraryIcon />
                <NavMenuItem.Label>{t('admin.shell.nav.taxonomy')}</NavMenuItem.Label>
              </NavMenuItem.CollapsibleItem>

              <NavMenuItem.CollapsibleMenu>
                {showAdminItems && (
                  <NavMenuItem>
                    <NavMenuItem.Link to="/admin/taxonomy/categories" className="pl-11">
                      <NavMenuItem.Label>{t('meta.title.admin.categories')}</NavMenuItem.Label>
                    </NavMenuItem.Link>
                  </NavMenuItem>
                )}
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/taxonomy/tags" className="pl-11">
                    <NavMenuItem.Label>{t('meta.title.admin.tags')}</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                {showAdminItems && (
                  <NavMenuItem>
                    <NavMenuItem.Link to="/admin/taxonomy/friends" className="pl-11">
                      <NavMenuItem.Label>{t('meta.title.admin.friends')}</NavMenuItem.Label>
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
              <NavMenuItem.CollapsibleItem ariaLabel={t('admin.shell.nav.expandMedia')}>
                <ImagesIcon />
                <NavMenuItem.Label>{t('admin.shell.nav.media')}</NavMenuItem.Label>
              </NavMenuItem.CollapsibleItem>

              <NavMenuItem.CollapsibleMenu>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/library/images" className="pl-11">
                    <NavMenuItem.Label>{t('meta.title.admin.images')}</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/library/music" className="pl-11">
                    <NavMenuItem.Label>{t('meta.title.admin.music')}</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                {showAdminItems && (
                  <NavMenuItem>
                    <NavMenuItem.Link to="/admin/library/branding" className="pl-11">
                      <NavMenuItem.Label>{t('meta.title.admin.branding')}</NavMenuItem.Label>
                    </NavMenuItem.Link>
                  </NavMenuItem>
                )}
                {showAdminItems && (
                  <NavMenuItem>
                    <NavMenuItem.Link to="/admin/library/fonts" className="pl-11">
                      <NavMenuItem.Label>{t('meta.title.admin.fonts')}</NavMenuItem.Label>
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
              <NavMenuItem.CollapsibleItem ariaLabel={t('admin.shell.nav.expandSecurity')}>
                <ShieldIcon />
                <NavMenuItem.Label>{t('admin.shell.nav.security')}</NavMenuItem.Label>
              </NavMenuItem.CollapsibleItem>

              <NavMenuItem.CollapsibleMenu>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/security/sessions" className="pl-11" end>
                    <NavMenuItem.Label>{t('meta.title.admin.sessions')}</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/security/audit-log" className="pl-11">
                    <NavMenuItem.Label>{t('meta.title.admin.auditLog')}</NavMenuItem.Label>
                  </NavMenuItem.Link>
                </NavMenuItem>
                <NavMenuItem>
                  <NavMenuItem.Link to="/admin/security/users" className="pl-11" activeMatch="subpath">
                    <NavMenuItem.Label>{t('meta.title.admin.users')}</NavMenuItem.Label>
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
