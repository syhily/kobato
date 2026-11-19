import { hasAtLeast } from '@kobato/auth/roles.ts'
import { createSsrCaller } from '@kobato/server/http/ssr-caller.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'
import { AdminErrorFallback } from '@kobato/web-admin/ui/shell/AdminErrorFallback.tsx'
import { AdminShell } from '@kobato/web-admin/ui/shell/AdminShell.tsx'
import { useDetachPublicCss } from '@kobato/web-client/hooks/use-detach-public-css.ts'
import { data, Outlet, redirect } from 'react-router'

import type { RouteHandle } from '@/root.tsx'

import type { Route } from './+types/layout'

// `admin.css` shares the token partial with the public site but scans only admin-rendered sources, so this
// bundle excludes the public cascade; `useDetachPublicCss` covers SPA navigations arriving with `public.css`
// still in <head>.
import '@/styles/admin.css'

export const handle: RouteHandle = { layout: 'admin', postFonts: true }

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, viewer } = createSsrCaller({ request, context })
  const user = viewer ?? undefined
  const role = viewer?.role ?? null
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
      name: user?.name ?? '',
      email: user?.email ?? '',
      role: (user?.role ?? null) as 'admin' | 'author' | 'visitor' | null,
    },
    siteTitle: getBlogSettingsBundleSync()?.siteIdentity?.title ?? '',
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
