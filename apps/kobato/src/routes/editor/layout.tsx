import { getRequestContext } from '@kobato/server/http/request-context.ts'
import { hasAtLeast } from '@kobato/utils/roles.ts'
import { useDetachPublicCss } from '@kobato/web/client/hooks/use-detach-public-css.ts'
import { AdminErrorFallback } from '@kobato/web/ui/admin/shell/AdminErrorFallback.tsx'
import { data, Outlet, redirect } from 'react-router'

import type { RouteHandle } from '@/root.tsx'

import type { Route } from './+types/layout'
import '@kobato/pt/styles/cards.css'
import '@kobato/ui/styles/ui.css'
import '@kobato/web/styles/admin.css'

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
      name: user?.name ?? '',
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
