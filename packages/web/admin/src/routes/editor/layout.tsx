import type { RouteHandle } from '@kobato/web-admin/root'

import { hasAtLeast } from '@kobato/base/auth/roles'
import { awaitRootBootstrap } from '@kobato/web-admin/lib/root-bootstrap'
import { AdminErrorFallback } from '@kobato/web-admin/ui/shell/AdminErrorFallback'
import { data, Outlet, redirect } from 'react-router'

import type { Route } from './+types/layout'
import '@kobato/web-admin/styles/admin.css'

export const handle: RouteHandle = { postFonts: true }

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await awaitRootBootstrap()
  const user = boot.currentUser ?? undefined
  const role = user?.role ?? null
  if (!hasAtLeast(role, 'author')) {
    const redirectPath = new URL(request.url).pathname
    throw redirect(`/admin/signin?redirect_to=${encodeURIComponent(redirectPath)}`)
  }

  return data({
    currentUser: {
      id: user?.id ?? '',
      name: user?.name ?? '',
      email: user?.email ?? '',
      role: user?.role ?? null,
    },
  })
}

export { AdminErrorFallback as ErrorBoundary }

export default function EditorLayoutRoute({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <Outlet context={{ currentUser: loaderData.currentUser }} />
    </>
  )
}
