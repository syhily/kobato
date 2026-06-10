import { Outlet, useLocation, useMatches, useRouteLoaderData } from 'react-router'

import type { RouteHandle } from '@/root'

import { useReloadOnChunkError } from '@/client/hooks/use-chunk-error-recovery'
import { isRecord } from '@/shared/utils/type-guards'
import { ErrorView } from '@/ui/public/chrome/ErrorView'
import { PublicChrome } from '@/ui/public/chrome/PublicChrome'

import type { Route } from './+types/layout'

// Pathless layout that wraps every public-facing route.
//
// 1. STATIC CSS GRAPH. `PublicChrome` statically imports `public.css`.
//    Because this module is statically imported by the route manifest,
//    React Router can include the compiled stylesheet in the SSR `<Links />`
//    output for every public URL.
//
// 2. ADMIN ISOLATION. The admin SPA sits OUTSIDE this layout, so Vite
//    never pulls `public.css` into admin chunks.
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
    <PublicChrome currentUser={currentUser} footer={footer} pathname={pathname} search={search}>
      <Outlet />
    </PublicChrome>
  )
}

// `ErrorBoundary` lives on this layout (not just on `root`) so that 404s
// thrown by public routes still render INSIDE `<PublicChrome>` synchronously.
// Without it the error would bubble up to the root boundary, which can only
// reach the chrome through a lazy chunk and would re-introduce FOUC.
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  useReloadOnChunkError(error)

  const { currentUser, footer } = useResolvedChromeProps()
  const { pathname, search } = useLocation()

  return (
    <PublicChrome currentUser={currentUser} footer={footer} pathname={pathname} search={search}>
      <ErrorView error={error} isDev={import.meta.env.DEV} />
    </PublicChrome>
  )
}
