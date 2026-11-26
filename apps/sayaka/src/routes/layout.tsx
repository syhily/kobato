import type { RouteHandle } from '@sayaka/root'

import { isRecord } from '@kobato/utils/type-guards'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { useReloadOnChunkError } from '@sayaka/document/use-chunk-error-recovery'
import { useDeviceEnvBeacon } from '@sayaka/document/use-device-env-beacon'
import { documentHeaders } from '@sayaka/server/headers'
import { BaseLayout } from '@sayaka/ui/chrome/BaseLayout'
import { ErrorView } from '@sayaka/ui/chrome/ErrorView'
import { Outlet, useLocation, useMatches, useRouteLoaderData } from 'react-router'

import type { Route } from './+types/layout'

import '@sayaka/styles/public.css'

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
  const rootData = unsafeCast<RootChromeData | undefined>(useRouteLoaderData('root'))
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

export const headers = documentHeaders

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
