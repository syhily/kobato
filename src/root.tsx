import '@/shared/zod-config'
import type { MiddlewareFunction, ShouldRevalidateFunctionArgs } from 'react-router'

import { dehydrate, HydrationBoundary, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useLayoutEffect, useState } from 'react'
import { preconnect, prefetchDNS } from 'react-dom'
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useMatches, useRouteLoaderData } from 'react-router'

import { setCsrfToken } from '@/client/api/client'
import { makeQueryClient } from '@/client/api/query-client'
import { RouteWarmupScript } from '@/client/components/RouteWarmupScript'
import { useChunkErrorRecovery, useReloadOnChunkError } from '@/client/hooks/use-chunk-error-recovery'
import { useFocusHash } from '@/client/hooks/use-focus-hash'
import { useIosNoZoomOnFocus } from '@/client/hooks/use-ios-no-zoom'
import { cspNonceContext, getRouteRequestContext } from '@/server/domains/auth/context'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { getWarmupManifest } from '@/server/render/warmup/manifest'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import { ThemeProvider, THEME_COOKIE } from '@/ui/lib/ThemeProvider'
import { ChunkReloadOverlay } from '@/ui/public/chrome/ChunkReloadOverlay'
import { ErrorView } from '@/ui/public/chrome/ErrorView'
import { NavigationSplash } from '@/ui/public/chrome/NavigationSplash'
const PublicChrome = lazy(() => import('@/ui/public/chrome/PublicChrome').then((m) => ({ default: m.PublicChrome })))

import type { Route } from './+types/root'

function collectTier2Chunks(
  manifest: {
    tier2_public: string[]
    tier2_admin: string[]
    tier2_editor: string[]
    tier2_auth: string[]
  },
  isAdmin: boolean,
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const push = (arr: string[]) => {
    for (const c of arr) {
      if (!seen.has(c)) {
        seen.add(c)
        result.push(c)
      }
    }
  }
  push(manifest.tier2_public)
  if (isAdmin) {
    push(manifest.tier2_admin)
    push(manifest.tier2_editor)
  }
  push(manifest.tier2_auth)
  return result
}

export const middleware: MiddlewareFunction<Response>[] = []

export function meta({ loaderData, matches }: Route.MetaArgs) {
  return routeMeta(undefined, loaderData?.blogSettings ?? bundleFromMatches(matches))
}

export function loader({ request, context }: Route.LoaderArgs) {
  const { role, user, session } = getRouteRequestContext({ request, context })
  const admin = role === 'admin'
  const csrfToken = session.get('csrfToken')
  if (typeof csrfToken !== 'string') {
    throw new Error('CSRF token missing from session — session middleware must run before root loader')
  }
  const currentUser = user && role ? { id: user.id, name: user.name, role } : null

  const cookie = request.headers.get('Cookie') ?? ''
  const themeMatch = cookie.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`))
  const cookieValue = themeMatch?.[1]
  const theme: 'dark' | 'light' | null = cookieValue === 'dark' ? 'dark' : cookieValue === 'light' ? 'light' : null

  const blogSettings = getBlogSettingsBundleSync()

  const queryClient = makeQueryClient()
  const dehydratedState = dehydrate(queryClient)

  const warmupManifest = getWarmupManifest()
  const tier1Links = warmupManifest?.tier1 ?? []
  const tier2Chunks = warmupManifest ? collectTier2Chunks(warmupManifest, admin) : []

  const cspNonce = (context as any).get(cspNonceContext)

  return { admin, currentUser, blogSettings, theme, csrfToken, dehydratedState, tier1Links, tier2Chunks, cspNonce }
}

export function shouldRevalidate({ formAction, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formAction && (formAction.startsWith('/admin/signin') || formAction.startsWith('/admin/setup'))) {
    return defaultShouldRevalidate
  }
  return false
}

export function Layout({ children }: { children: React.ReactNode }) {
  const rootData = useRouteLoaderData<{
    admin?: boolean
    theme?: 'dark' | 'light' | null
    blogSettings?: {
      fonts?: { globalCss?: string[]; postCss?: string[] } | null
      assets?: { asset?: { host?: string } | null } | null
      siteIdentity?: { locale?: string } | null
    } | null
    tier1Links?: string[]
    tier2Chunks?: string[]
    csrfToken?: string
    cspNonce?: string
  }>('root')
  const theme = rootData?.theme ?? null
  const globalFontCss = rootData?.blogSettings?.fonts?.globalCss ?? []
  const assetHost = rootData?.blogSettings?.assets?.asset?.host

  const fontHosts: string[] = []
  for (const url of globalFontCss) {
    try {
      const host = new URL(url).host
      if (!fontHosts.includes(host)) {
        fontHosts.push(host)
      }
    } catch {
      // Invalid URL — skip.
    }
  }

  if (assetHost) {
    preconnect(`https://${assetHost}`, { crossOrigin: 'anonymous' })
  }
  for (const host of fontHosts) {
    preconnect(`https://${host}`)
    prefetchDNS(`https://${host}`)
  }

  const tier1Links = rootData?.tier1Links ?? []
  const tier2Chunks = rootData?.tier2Chunks ?? []

  const locale = rootData?.blogSettings?.siteIdentity?.locale ?? 'zh-CN'

  const matches = useMatches()
  const wantsPostFonts = matches.some((m) => (m.handle as RouteHandle | undefined)?.postFonts === true)
  const postFontCss = wantsPostFonts ? (rootData?.blogSettings?.fonts?.postCss ?? []) : []

  return (
    <html lang={locale} className={theme ?? undefined}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content={theme ?? 'light dark'} />
        {globalFontCss.map((url) => (
          <link key={url} rel="stylesheet" href={url} />
        ))}
        {postFontCss.map((url) => (
          <link key={url} rel="stylesheet" href={url} />
        ))}
        <Meta />
        <Links />
        {tier1Links.map((href) => (
          <link key={href} rel="modulepreload" href={href} />
        ))}
      </head>
      <body>
        {children}
        <ChunkReloadOverlay />
        <ScrollRestoration nonce={rootData?.cspNonce} />
        <Scripts nonce={rootData?.cspNonce} />
        <RouteWarmupScript chunks={tier2Chunks} nonce={rootData?.cspNonce} />
      </body>
    </html>
  )
}

// Routes can opt-in to a custom chrome by exporting a `handle.layout` value.
// `"admin"` marks routes that own their own chrome (admin SPA, login/install
// split-screen). Routes can also disable the site footer with
// `handle.footer = false` (see `routes/public/page/detail.tsx`).
export type RouteHandle = {
  layout?: 'admin'
  footer?: boolean
  postFonts?: boolean
}

export default function App({ loaderData }: Route.ComponentProps) {
  useLayoutEffect(() => {
    setCsrfToken(loaderData.csrfToken)
  }, [loaderData.csrfToken])

  useFocusHash()
  useIosNoZoomOnFocus()
  useChunkErrorRecovery()
  const [queryClient] = useState(() => makeQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={loaderData.dehydratedState}>
        <ThemeProvider initialResolved={loaderData.theme ?? undefined}>
          <BlogSettingsProvider value={loaderData.blogSettings ?? undefined}>
            <NavigationSplash />
            <Outlet />
          </BlogSettingsProvider>
        </ThemeProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  )
}

export function ErrorBoundary({ error, loaderData }: Route.ErrorBoundaryProps) {
  useReloadOnChunkError(error)

  const blogSettings = loaderData?.blogSettings ?? getBlogSettingsBundleSync()
  const isDev = import.meta.env.DEV === true && import.meta.env.PROD !== true
  const body = <ErrorView error={error} isDev={isDev} />

  return (
    <ThemeProvider initialResolved={loaderData?.theme ?? undefined}>
      <BlogSettingsProvider value={blogSettings ?? undefined}>
        {blogSettings ? (
          <Suspense fallback={body}>
            <PublicChrome currentUser={loaderData?.currentUser ?? null} pathname="/" search="">
              {body}
            </PublicChrome>
          </Suspense>
        ) : (
          body
        )}
      </BlogSettingsProvider>
    </ThemeProvider>
  )
}
