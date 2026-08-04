import { useReloadOnChunkError } from '@kobato/client/hooks/use-chunk-error-recovery'
import { isRecord } from '@kobato/shared/utils/type-guards'
import { BaseLayout } from '@kobato/ui/public/chrome/BaseLayout'
import { ErrorView } from '@kobato/ui/public/chrome/ErrorView'
import { Outlet, useLocation, useMatches, useRouteLoaderData } from 'react-router'

import type { RouteHandle } from '@/root'

import type { Route } from './+types/layout'

// Pathless layout wrapping every public-facing route. `BaseLayout`
// statically imports `public.css`, so the compiled stylesheet lands in the
// SSR `<Links />` output for every public URL, while the admin SPA sits
// OUTSIDE this layout and never pulls `public.css` into admin chunks.
//
// Routes that need to opt out of the site footer use `handle.footer = false`.

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

  return (
    <BaseLayout currentUser={currentUser} footer={footer} pathname={pathname} search={search}>
      <Outlet />
    </BaseLayout>
  )
}

// `ErrorBoundary` lives on this layout (not just on `root`) so that 404s
// thrown by public routes still render INSIDE `<BaseLayout>` synchronously.
// Without it the error would bubble up to the root boundary, which can only
// reach the chrome through a lazy chunk and would re-introduce FOUC.
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
