import { useDetachPublicCss } from '@kobato/client/hooks/use-detach-public-css'
import { countAdminPendingDashboard } from '@kobato/server/domains/comments/services/admin-query'
import { countUsers } from '@kobato/server/domains/users/services/admin'
import { countPendingWebmentionsForAdmin } from '@kobato/server/domains/webmentions/service'
import { getRequestContext } from '@kobato/server/http/request-context'
import { getBlogSettingsBundleSync } from '@kobato/shared/config/getters'
import { hasAtLeast } from '@kobato/shared/utils/roles'
import { AdminErrorFallback } from '@kobato/ui/admin/shell/AdminErrorFallback'
import { AdminShell } from '@kobato/ui/admin/shell/AdminShell'
import { data, Outlet, redirect } from 'react-router'

import type { RouteHandle } from '@/root'

import type { Route } from './+types/layout'

// The admin SPA only needs Tailwind v4 (with the `` prefix) plus the
// shadcn admin theme tokens declared inside `admin.css`. Importing
// `tailwind.css` directly here keeps Bootstrap reboot/grid/utilities and the
// public-site cascade (`public.css`) out of this route's chunk, matching
// the project's "admin pages do not load public.css" contract.
import '@/styles/admin.css'

export const handle: RouteHandle = { layout: 'admin', postFonts: true }

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  const { db, url } = rc
  const user = rc.viewer ?? undefined
  const role = rc.viewer?.role ?? null
  // Self-service visitors land on `/admin/me/profile`; other admin
  // routes have their own per-route `requireRole` gate that promotes
  // the minimum to `author` (content management) or `admin` (settings,
  // user management, friends). Keeping the layout open to visitors
  // lets a logged-in commenter reach their own profile without us
  // having to ship two parallel chromes.
  if (!hasAtLeast(role, 'visitor')) {
    const redirectPath = url.pathname
    throw redirect(`/admin/signin?redirect_to=${encodeURIComponent(redirectPath)}`)
  }

  const pendingComments = hasAtLeast(role, 'admin') ? await countAdminPendingDashboard(db) : { all: 0 }
  const pendingWebmentions = hasAtLeast(role, 'admin') ? await countPendingWebmentionsForAdmin(db) : 0
  const userCount = hasAtLeast(role, 'admin') ? await countUsers(db) : 0
  return data({
    currentUser: {
      id: user?.id ?? '',
      name: user?.name ?? '管理员',
      email: user?.email ?? '',
      role: (user?.role ?? null) as 'admin' | 'author' | 'visitor' | null,
    },
    siteTitle: getBlogSettingsBundleSync()?.siteIdentity?.title ?? '管理后台',
    pendingCommentCount: pendingComments.all,
    pendingWebmentionCount: pendingWebmentions,
    userCount,
  })
}

export { AdminErrorFallback as ErrorBoundary }

export default function WpAdminLayoutRoute({ loaderData }: Route.ComponentProps) {
  useDetachPublicCss()
  return (
    <>
      <AdminShell
        currentUser={loaderData.currentUser}
        siteTitle={loaderData.siteTitle}
        pendingCommentCount={loaderData.pendingCommentCount}
        pendingWebmentionCount={loaderData.pendingWebmentionCount}
        userCount={loaderData.userCount}
      >
        <Outlet context={{ currentUser: loaderData.currentUser }} />
      </AdminShell>
    </>
  )
}
