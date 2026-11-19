import { documentHeaders } from '@kobato/server/infra/http/headers.ts'
import { isRecord } from '@kobato/utils/type-guards.ts'
import { useReloadOnChunkError } from '@kobato/web-client/hooks/use-chunk-error-recovery.ts'
import { useDeviceEnvBeacon } from '@kobato/web-client/hooks/use-device-env-beacon.ts'
import { BaseLayout } from '@kobato/web-public/ui/chrome/BaseLayout.tsx'
import { ErrorView } from '@kobato/web-public/ui/chrome/ErrorView.tsx'
import { Outlet, useLocation, useMatches, useRouteLoaderData } from 'react-router'

import type { RouteHandle } from '@/root.tsx'

import type { Route } from './+types/layout'

import '@/styles/public.css'

// This app-owned entry statically imports `public.css`, so SSR emits it for every public URL while
// the admin SPA stays outside this layout and never pulls `public.css` into admin chunks.

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
