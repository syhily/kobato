import { Outlet, useLocation, useMatches, useRouteLoaderData } from 'react-router'

import type { RouteHandle } from '@/root'

import { useReloadOnChunkError } from '@/client/hooks/use-chunk-error-recovery'
import { useDeviceEnvBeacon } from '@/client/hooks/use-device-env-beacon'
import { documentHeaders } from '@/server/infra/http/headers'
import { isRecord } from '@/shared/utils/type-guards'
import { BaseLayout } from '@/ui/public/chrome/BaseLayout'
import { ErrorView } from '@/ui/public/chrome/ErrorView'

import type { Route } from './+types/layout'

// `BaseLayout` statically imports `public.css`, so the compiled stylesheet lands in the SSR `<Links />` output
// for every public URL, while the admin SPA sits outside this layout and never pulls `public.css` into admin chunks.

interface RootChromeData {
  currentUser?: { id: string; name: string; role: 'admin' | 'author' | 'visitor' } | null
}

function isRouteHandle(value: unknown): value is RouteHandle {
  return isRecord(value) && typeof value.footer === 'boolean'
}

function useResolvedChromeProps(): {
  currentUser: NonNullable<RootChromeData['currentUser']> | null
  footer: boolean
} {
  const matches = useMatches()
  const rootData = useRouteLoaderData('root') as RootChromeData | undefined
  const currentUser = rootData?.currentUser ?? null

  const footer = matches.reduce<boolean>((acc, match) => {
    const handle = isRouteHandle(match.handle) ? match.handle : undefined
    if (handle?.footer === false) {
      return false
    }
    return acc
  }, true)

  return { currentUser, footer }
}

export default function PublicLayoutRoute() {
  const { currentUser, footer } = useResolvedChromeProps()
  const { pathname, search } = useLocation()
  // One device-environment beacon per page view; DNT silences it.
  useDeviceEnvBeacon()

  return (
    <BaseLayout currentUser={currentUser} footer={footer} pathname={pathname} search={search}>
      <Outlet />
    </BaseLayout>
  )
}

// Nearest error boundary for public routes: RR hands loader-thrown 304 headers here as `errorHeaders`, so without
// this export the document 304 loses ETag/Content-Language/Cache-Control (entry.server never runs for no-body).
export const headers = documentHeaders

// `ErrorBoundary` lives here so 404s render inside `<BaseLayout>` synchronously; the root boundary would need a
// lazy chunk and reintroduce FOUC.
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  useReloadOnChunkError(error)

  const { currentUser, footer } = useResolvedChromeProps()
  const { pathname, search } = useLocation()

  return (
    <BaseLayout currentUser={currentUser} footer={footer} pathname={pathname} search={search}>
      <ErrorView error={error} isDev={import.meta.env.DEV} />
    </BaseLayout>
  )
}
