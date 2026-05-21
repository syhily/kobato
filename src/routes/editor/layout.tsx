import { data, Outlet, redirect } from 'react-router'

import type { RouteHandle } from '@/root'

import { useDetachPublicCss } from '@/client/hooks/use-detach-public-css'
import { getRouteRequestContext } from '@/server/domains/auth/context'
import { hasAtLeast } from '@/server/domains/auth/rbac'
import { AdminErrorFallback } from '@/ui/admin/shell/AdminErrorFallback'
import { PostFontLinks } from '@/ui/public/post/PostFontLinks'

import type { Route } from './+types/layout'
import '@/assets/styles/admin.css'

export const handle: RouteHandle = { layout: 'admin' }

export async function loader({ request, context }: Route.LoaderArgs) {
  const { role, user, url } = getRouteRequestContext({ request, context })
  if (!hasAtLeast(role, 'author')) {
    const redirectPath = url.pathname.replace(/\.data$/, '')
    throw redirect(`/admin/signin?redirect_to=${encodeURIComponent(redirectPath)}`)
  }

  return data({
    currentUser: {
      id: user?.id ?? '',
      name: user?.name ?? '管理员',
      email: user?.email ?? '',
      role: (user?.role ?? null) as 'admin' | 'author' | 'visitor' | null,
    },
  })
}

export { AdminErrorFallback as ErrorBoundary }

export default function EditorLayoutRoute({ loaderData }: Route.ComponentProps) {
  useDetachPublicCss()
  return (
    <>
      <PostFontLinks />
      <Outlet context={{ currentUser: loaderData.currentUser }} />
    </>
  )
}
