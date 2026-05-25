import { data, Outlet, redirect } from 'react-router'

import type { RouteHandle } from '@/root'

import { useDetachPublicCss } from '@/client/hooks/use-detach-public-css'
import { getRouteRequestContext } from '@/server/domains/auth/context'
import { hasAtLeast } from '@/server/domains/auth/rbac'
import { countAdminPendingDashboard } from '@/server/domains/comments/repos/admin-query'
import { countUsers } from '@/server/infra/db/operations/user'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { AdminErrorFallback } from '@/ui/admin/shell/AdminErrorFallback'
import { AdminShell } from '@/ui/admin/shell/AdminShell'
import { PostFontLinks } from '@/ui/public/post/PostFontLinks'

import type { Route } from './+types/layout'

// The admin SPA only needs Tailwind v4 (with the `` prefix) plus the
// shadcn admin theme tokens declared inside `admin.css`. Importing
// `tailwind.css` directly here keeps Bootstrap reboot/grid/utilities and the
// public-site cascade (`public.css`) out of this route's chunk, matching
// the project's "admin pages do not load public.css" contract.
import '@/styles/admin.css'

export const handle: RouteHandle = { layout: 'admin' }

export async function loader({ request, context }: Route.LoaderArgs) {
  const { role, user, url } = getRouteRequestContext({ request, context })
  // Self-service visitors land on `/admin/me/profile`; other admin
  // routes have their own per-route `requireRole` gate that promotes
  // the minimum to `author` (content management) or `admin` (settings,
  // user management, friends). Keeping the layout open to visitors
  // lets a logged-in commenter reach their own profile without us
  // having to ship two parallel chromes.
  if (!hasAtLeast(role, 'visitor')) {
    const redirectPath = url.pathname.replace(/\.data$/, '')
    throw redirect(`/admin/signin?redirect_to=${encodeURIComponent(redirectPath)}`)
  }

  const pendingComments = hasAtLeast(role, 'admin') ? await countAdminPendingDashboard() : { all: 0 }
  const userCount = hasAtLeast(role, 'admin') ? await countUsers() : 0
  return data({
    currentUser: {
      id: user?.id ?? '',
      name: user?.name ?? '管理员',
      email: user?.email ?? '',
      role: (user?.role ?? null) as 'admin' | 'author' | 'visitor' | null,
    },
    siteTitle: getBlogSettingsBundleSync()?.siteIdentity?.title ?? '管理后台',
    pendingCommentCount: pendingComments.all,
    userCount,
  })
}

export { AdminErrorFallback as ErrorBoundary }

export default function WpAdminLayoutRoute({ loaderData }: Route.ComponentProps) {
  useDetachPublicCss()
  return (
    <>
      {/*
        globalCss already loads on every route via root.tsx's <Layout>;
        admin additionally pulls in postCss so the page-body editor
        preview and any in-admin `.prose-blog` rendering see the same
        serif typography the public article surface gets.
      */}
      <PostFontLinks />
      <AdminShell
        currentUser={loaderData.currentUser}
        siteTitle={loaderData.siteTitle}
        pendingCommentCount={loaderData.pendingCommentCount}
        userCount={loaderData.userCount}
      >
        <Outlet context={{ currentUser: loaderData.currentUser }} />
      </AdminShell>
    </>
  )
}
