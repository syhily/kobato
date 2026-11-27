import type { RouteHandle } from '@kobato/web-admin/root'

import { orpc } from '@kobato/api/browser/client'
import { hasAtLeast } from '@kobato/auth/roles'
import { awaitRootBootstrap, requireRoleFromBootstrap } from '@kobato/web-admin/lib/root-bootstrap'
import { AdminErrorFallback } from '@kobato/web-admin/ui/shell/AdminErrorFallback'
import { AdminShell } from '@kobato/web-admin/ui/shell/AdminShell'
import { data, Outlet } from 'react-router'

import type { Route } from './+types/layout'

import '@kobato/web-admin/styles/admin.css'

export const handle: RouteHandle = { postFonts: true }

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  requireRoleFromBootstrap(boot, 'visitor', { pathname: new URL(request.url).pathname })
  const user = boot.currentUser ?? undefined
  const role = user?.role ?? null

  const [pendingComments, pendingWebmentions, userCount] = hasAtLeast(role, 'admin')
    ? await Promise.all([
        orpc.admin.comments.pendingCount(),
        orpc.admin.webmentions.pendingCount(),
        orpc.admin.users.count(),
      ])
    : ([{ all: 0 }, 0, 0] as const)
  return data({
    currentUser: {
      id: user?.id ?? '',
      name: user?.name ?? '',
      email: user?.email ?? '',
      role: user?.role ?? null,
    },
    siteTitle: boot.blogSettings?.siteIdentity?.title ?? '',
    pendingCommentCount: pendingComments.all,
    pendingWebmentionCount: pendingWebmentions,
    userCount,
  })
}

export { AdminErrorFallback as ErrorBoundary }

export default function WpAdminLayoutRoute({ loaderData }: Route.ComponentProps) {
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
