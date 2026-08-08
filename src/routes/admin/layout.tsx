import { data, Outlet, redirect } from 'react-router'

import type { RouteHandle } from '@/root'

import { useDetachPublicCss } from '@/client/hooks/use-detach-public-css'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { hasAtLeast } from '@/shared/utils/roles'
import { AdminErrorFallback } from '@/ui/admin/shell/AdminErrorFallback'
import { AdminShell } from '@/ui/admin/shell/AdminShell'

import type { Route } from './+types/layout'

// `admin.css` is the admin-side Tailwind entry: it shares the token partial
// with the public site but scans only admin-rendered sources, so this route's
// bundle excludes the public cascade. `useDetachPublicCss` covers SPA
// navigations arriving with `public.css` still in <head>.
import '@/styles/admin.css'

export const handle: RouteHandle = { layout: 'admin', postFonts: true }

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  const user = viewer ?? undefined
  const role = viewer?.role ?? null
  // Keep the layout open to visitors so a logged-in commenter reaches their
  // own profile — no need for two parallel chromes. Other routes gate themselves.
  if (!hasAtLeast(role, 'visitor')) {
    const redirectPath = new URL(request.url).pathname
    throw redirect(`/admin/signin?redirect_to=${encodeURIComponent(redirectPath)}`)
  }

  const [pendingComments, pendingWebmentions, userCount] = hasAtLeast(role, 'admin')
    ? await Promise.all([
        caller.admin.comments.pendingCount(),
        caller.admin.webmentions.pendingCount(),
        caller.admin.users.count(),
      ])
    : ([{ all: 0 }, 0, 0] as const)
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
