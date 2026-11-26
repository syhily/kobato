import '@/zod-config'
import type { ContentBootstrapI18n } from '@kobato/api/contracts/public/content'

import { setCsrfToken } from '@kobato/api/browser/client'
import { makeQueryClient } from '@kobato/api/browser/query-client'
import { bundleFromMatches, i18nFromMatches, routeMeta } from '@kobato/catalog/seo/meta'
import { fallbackMessages } from '@kobato/i18n/fallback-messages'
import { DEFAULT_LOCALE, type AppLocale } from '@kobato/i18n/locales'
import { LazyMotionConfig } from '@kobato/ui/components/lazy-motion'
import { Skeleton } from '@kobato/ui/components/skeleton'
import { defaultFontStackFor } from '@kobato/ui/lib/font-stacks'
import { I18nProvider } from '@kobato/ui/lib/I18nProvider'
import { defaultTransition } from '@kobato/ui/lib/motion'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider'
import { isRecord } from '@kobato/utils/type-guards'
import { BrandLogo } from '@kobato/web-kit/ui/chrome/BrandLogo'
import { ChunkReloadOverlay } from '@kobato/web-kit/ui/chrome/ChunkReloadOverlay'
import { BlogSettingsProvider } from '@kobato/web-kit/ui/lib/blog-settings-context'
import { LocaleSyncProvider } from '@kobato/web-kit/ui/lib/LocaleSyncProvider'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useLayoutEffect, useState } from 'react'
import { preconnect, prefetchDNS } from 'react-dom'
import {
  Links,
  Meta,
  Outlet,
  redirect,
  Scripts,
  ScrollRestoration,
  useLocation,
  useMatches,
  useRouteLoaderData,
} from 'react-router'

import { useChunkErrorRecovery, useReloadOnChunkError } from '@/document/use-chunk-error-recovery'
import { useIosNoZoomOnFocus } from '@/document/use-ios-no-zoom'
import { loadRootBootstrap } from '@/lib/root-bootstrap'
import { useRouteWarmup } from '@/route-warmup/use-route-warmup'
import { AdminErrorFallback } from '@/ui/shell/AdminErrorFallback'
import '@kobato/ui/styles/ui.css'

import type { Route } from './+types/root'

export function meta({ loaderData, matches }: Route.MetaArgs) {
  return routeMeta(
    undefined,
    loaderData?.blogSettings ?? bundleFromMatches(matches),
    loaderData?.i18n ?? i18nFromMatches(matches),
  )
}

const SETUP_PATH = '/admin/setup'

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const boot = await loadRootBootstrap()
  setCsrfToken(boot.csrfToken)
  if (boot.installState === 'noAdmin' && new URL(request.url).pathname !== SETUP_PATH) {
    throw redirect(SETUP_PATH, { status: 303 })
  }
  return {
    admin: boot.admin,
    currentUser: boot.currentUser,
    blogSettings: boot.blogSettings,
    fonts: boot.fonts,
    theme: boot.theme,
    csrfToken: boot.csrfToken,
    installState: boot.installState,
    i18n: boot.i18n,
  }
}

export function HydrateFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background">
      <BrandLogo alt="" className="h-16 w-auto opacity-80" />
      <div className="flex w-56 flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const rootData = useRouteLoaderData<{
    admin?: boolean
    theme?: 'dark' | 'light' | null
    blogSettings?: {
      assets?: { asset?: { host?: string; scheme?: 'http' | 'https' } | null } | null
      siteIdentity?: { locale?: string } | null
    } | null
    fonts?: {
      global: { family: string; href: string }[]
      post: { family: string; href: string }[]
      code: { family: string; href: string }[]
    } | null
    csrfToken?: string
    i18n?: ContentBootstrapI18n | null
  }>('root')
  const theme = rootData?.theme ?? null
  const asset = rootData?.blogSettings?.assets?.asset
  const fonts = rootData?.fonts
  const globalFonts = fonts?.global ?? []
  const postFonts = fonts?.post ?? []
  const codeFonts = fonts?.code ?? []

  const matches = useMatches()
  const wantsPostFonts = matches.some((m) => isRecord(m.handle) && m.handle.postFonts === true)
  const activePostFonts = wantsPostFonts ? postFonts : []
  const activeCodeFonts = wantsPostFonts ? codeFonts : []

  const fontOrigins = new Set<string>()
  for (const f of [...globalFonts, ...activePostFonts, ...activeCodeFonts]) {
    if (!f.href) {
      continue
    }
    try {
      const origin = new URL(f.href).origin
      if (origin) {
        fontOrigins.add(origin)
      }
    } catch {}
  }

  const assetOrigin = asset?.host ? `${asset.scheme ?? 'https'}://${asset.host}` : null
  if (assetOrigin !== null) {
    fontOrigins.add(assetOrigin)
    preconnect(assetOrigin, { crossOrigin: 'anonymous' })
  }
  for (const origin of fontOrigins) {
    preconnect(origin)
    prefetchDNS(origin)
  }

  const i18n = rootData?.i18n ?? null
  const locale: AppLocale = i18n?.locale ?? DEFAULT_LOCALE
  const messages = i18n?.messages ?? fallbackMessages

  const htmlStyle: Record<string, string> = {}
  const defaultFonts = defaultFontStackFor(locale)
  if (globalFonts.length > 0) {
    const stack = globalFonts.map((f) => `'${f.family}'`).join(', ')
    htmlStyle['--font-body'] = `${stack}, ${defaultFonts.body}`
  }
  if (activePostFonts.length > 0) {
    const stack = activePostFonts.map((f) => `'${f.family}'`).join(', ')
    htmlStyle['--font-serif'] = `${stack}, ${defaultFonts.serif}`
  }
  if (activeCodeFonts.length > 0) {
    const stack = activeCodeFonts.map((f) => `'${f.family}'`).join(', ')
    htmlStyle['--font-code'] = `${stack}, ${defaultFonts.code}`
  }

  return (
    <html
      lang={locale}
      className={theme ?? undefined}
      style={Object.keys(htmlStyle).length > 0 ? htmlStyle : undefined}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content={theme ?? 'light dark'} />
        {globalFonts.map((f) => (f.href ? <link key={`g-${f.href}`} rel="stylesheet" href={f.href} /> : null))}
        {activePostFonts.map((f) => (f.href ? <link key={`p-${f.href}`} rel="stylesheet" href={f.href} /> : null))}
        {activeCodeFonts.map((f) => (f.href ? <link key={`c-${f.href}`} rel="stylesheet" href={f.href} /> : null))}
        <Meta />
        <Links />
      </head>
      <body>
        <I18nProvider locale={locale} messages={messages}>
          {children}
          <ChunkReloadOverlay />
          <ScrollRestoration />
          <Scripts />
        </I18nProvider>
      </body>
    </html>
  )
}

export type RouteHandle = {
  postFonts?: boolean
}

export default function App({ loaderData }: Route.ComponentProps) {
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    setCsrfToken(loaderData.csrfToken)
  }, [loaderData.csrfToken])

  useIosNoZoomOnFocus()
  useChunkErrorRecovery()
  useRouteWarmup({ admin: loaderData.admin, pathname })
  const [queryClient] = useState(() => makeQueryClient())

  const i18n = loaderData.i18n
  const locale = i18n?.locale ?? DEFAULT_LOCALE

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initialResolved={loaderData.theme ?? undefined}>
        <BlogSettingsProvider value={loaderData.blogSettings ?? undefined}>
          <LazyMotionConfig reducedMotion="user" transition={defaultTransition}>
            <LocaleSyncProvider locale={locale} revision={i18n?.revision}>
              <Outlet />
            </LocaleSyncProvider>
          </LazyMotionConfig>
        </BlogSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export function ErrorBoundary({ error, loaderData }: Route.ErrorBoundaryProps) {
  useReloadOnChunkError(error)

  const i18n = loaderData?.i18n ?? null
  const locale: AppLocale = i18n?.locale ?? DEFAULT_LOCALE

  return (
    <ThemeProvider initialResolved={loaderData?.theme ?? undefined}>
      <BlogSettingsProvider value={loaderData?.blogSettings ?? undefined}>
        <I18nProvider locale={locale} messages={i18n?.messages ?? fallbackMessages}>
          <LazyMotionConfig reducedMotion="user" transition={defaultTransition}>
            <AdminErrorFallback />
          </LazyMotionConfig>
        </I18nProvider>
      </BlogSettingsProvider>
    </ThemeProvider>
  )
}
