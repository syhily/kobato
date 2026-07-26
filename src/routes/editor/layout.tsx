import { data, Outlet, redirect } from 'react-router'

import type { RouteHandle } from '@/root'

import { useDetachPublicCss } from '@/client/hooks/use-detach-public-css'
import { getRequestContext } from '@/server/http/request-context'
import { hasAtLeast } from '@/shared/utils/roles'
import { AdminErrorFallback } from '@/ui/admin/shell/AdminErrorFallback'

import type { Route } from './+types/layout'
import '@/styles/admin.css'

export const handle: RouteHandle = { layout: 'admin', postFonts: true }

export async function loader({ request, context }: Route.LoaderArgs) {
  const rc = getRequestContext({ request, context })
  const { url } = rc
  const user = rc.viewer ?? undefined
  const role = rc.viewer?.role ?? null
  if (!hasAtLeast(role, 'author')) {
    const redirectPath = url.pathname
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
      <Outlet context={{ currentUser: loaderData.currentUser }} />
    </>
  )
}
