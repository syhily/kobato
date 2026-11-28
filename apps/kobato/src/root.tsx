import '@/zod-config'
import { setCsrfToken } from '@kobato/api/browser/client'
import { makeQueryClient } from '@kobato/api/browser/query-client'
import { isRecord } from '@kobato/base/utils/type-guards'
import { bundleFromMatches, i18nFromMatches, routeMeta } from '@kobato/catalog/seo/meta'
import { fallbackMessages } from '@kobato/i18n/fallback-messages'
import { DEFAULT_LOCALE } from '@kobato/i18n/locales'
import { BrandLogo } from '@kobato/ui/components/BrandLogo'
import { DocumentProviders } from '@kobato/ui/components/document-shell/DocumentProviders'
import { DocumentShell } from '@kobato/ui/components/document-shell/DocumentShell'
import { LazyMotionConfig } from '@kobato/ui/components/lazy-motion'
import { Skeleton } from '@kobato/ui/components/skeleton'
import { BlogSettingsProvider } from '@kobato/ui/lib/blog-settings-context'
import { I18nProvider } from '@kobato/ui/lib/I18nProvider'
import { defaultTransition } from '@kobato/ui/lib/motion'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useLayoutEffect, useMemo, useState } from 'react'
import { Links, Meta, Outlet, Scripts, ScrollRestoration, redirect, useMatches, useRouteLoaderData } from 'react-router'

import { documentFactsFrom } from '@/document/document-facts'
import { useChunkErrorRecovery, useReloadOnChunkError } from '@/document/use-chunk-error-recovery'
import { useIosNoZoomOnFocus } from '@/document/use-ios-no-zoom'
import { loadRootBootstrap } from '@/lib/root-bootstrap'
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

type RootLoaderData = Route.ComponentProps['loaderData']

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
  const rootData = useRouteLoaderData<RootLoaderData>('root')
  const facts = useMemo(() => documentFactsFrom(rootData), [rootData])
  const wantsPostFonts = useMatches().some((m) => isRecord(m.handle) && m.handle.postFonts === true)

  return (
    <DocumentShell
      facts={facts}
      postFonts={wantsPostFonts}
      head={
        <>
          <Meta />
          <Links />
        </>
      }
      bodyEnd={
        <>
          <ScrollRestoration />
          <Scripts />
        </>
      }
    >
      {children}
    </DocumentShell>
  )
}

export type RouteHandle = {
  postFonts?: boolean
}

export default function App({ loaderData }: Route.ComponentProps) {
  useLayoutEffect(() => {
    setCsrfToken(loaderData.csrfToken)
  }, [loaderData.csrfToken])

  useIosNoZoomOnFocus()
  useChunkErrorRecovery()
  const [queryClient] = useState(() => makeQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <DocumentProviders>
        <Outlet />
      </DocumentProviders>
    </QueryClientProvider>
  )
}

export function ErrorBoundary({ error, loaderData }: Route.ErrorBoundaryProps) {
  useReloadOnChunkError(error)

  const i18n = loaderData?.i18n ?? null
  const locale = i18n?.locale ?? DEFAULT_LOCALE

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
