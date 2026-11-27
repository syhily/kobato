import '@sayaka/zod-config'
import type { WarmupManifest } from '@kobato/base/distribution/warmup-manifest'
import type { ShouldRevalidateFunctionArgs } from 'react-router'

import { setCsrfToken } from '@kobato/api/browser/client'
import { makeQueryClient } from '@kobato/api/browser/query-client'
import { isRecord } from '@kobato/base/utils/type-guards'
import { bundleFromMatches, i18nFromMatches, routeMeta } from '@kobato/catalog/seo/meta'
import { isWebmentionReceiveEnabled } from '@kobato/settings/getters'
import { DocumentProviders } from '@kobato/ui/components/document-shell/DocumentProviders'
import { DocumentShell } from '@kobato/ui/components/document-shell/DocumentShell'
import { LazyMotionConfig } from '@kobato/ui/components/lazy-motion'
import { BlogSettingsProvider } from '@kobato/ui/lib/blog-settings-context'
import { defaultTransition } from '@kobato/ui/lib/motion'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider'
import { documentFactsFrom } from '@sayaka/document/document-facts'
import { useChunkErrorRecovery, useReloadOnChunkError } from '@sayaka/document/use-chunk-error-recovery'
import { useFocusHash } from '@sayaka/document/use-focus-hash'
import { useIosNoZoomOnFocus } from '@sayaka/document/use-ios-no-zoom'
import { RouteWarmupScript } from '@sayaka/route-warmup/RouteWarmupScript'
import { useRum, isRumDenied } from '@sayaka/rum/use-rum'
import { useRumConsent } from '@sayaka/rum/use-rum-consent'
import { documentHeaders } from '@sayaka/server/headers'
import { isNavigationRequest } from '@sayaka/server/navigation-request'
import { getSayakaContext } from '@sayaka/server/request-context'
import { getCriticalChunksForPathname, getWarmupManifest } from '@sayaka/server/warmup-manifest'
import { ErrorView } from '@sayaka/ui/chrome/ErrorView'
import { NavigationSplash } from '@sayaka/ui/chrome/NavigationSplash'
import { RumConsentBanner } from '@sayaka/ui/chrome/RumConsentBanner'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, Suspense, lazy, useLayoutEffect, useMemo, useState } from 'react'
import { Links, Meta, Outlet, Scripts, ScrollRestoration, redirect, useMatches, useRouteLoaderData } from 'react-router'
import '@kobato/ui/styles/ui.css'

const PublicErrorLayout = lazy(() =>
  Promise.all([import('@sayaka/styles/public.css'), import('@sayaka/ui/chrome/BaseLayout')]).then(([, module]) => ({
    default: module.BaseLayout,
  })),
)

import type { Route } from './+types/root'

function collectTier2Chunks(manifest: Pick<WarmupManifest, 'tier2'>, criticalSet: Set<string>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const chunk of manifest.tier2) {
    if (!seen.has(chunk) && !criticalSet.has(chunk)) {
      seen.add(chunk)
      result.push(chunk)
    }
  }
  return result
}

export const headers = documentHeaders

export function meta({ loaderData, matches }: Route.MetaArgs) {
  return routeMeta(
    undefined,
    loaderData?.blogSettings ?? bundleFromMatches(matches),
    loaderData?.i18n ?? i18nFromMatches(matches),
  )
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getSayakaContext({ context })

  const boot = await ctx.bootstrap()
  if (boot.installState === 'noAdmin' && isNavigationRequest(request)) {
    throw redirect('/admin/setup', { status: 303 })
  }

  const warmupManifest = getWarmupManifest()
  const pathname = new URL(request.url).pathname
  const criticalLinks = getCriticalChunksForPathname(pathname) ?? warmupManifest?.tier1 ?? []
  const tier2Chunks = warmupManifest ? collectTier2Chunks(warmupManifest, new Set(criticalLinks)) : []

  const nowIso = new Date().toISOString()

  return {
    admin: boot.admin,
    currentUser: boot.currentUser,
    blogSettings: boot.blogSettings,
    fonts: boot.fonts,
    theme: boot.theme,
    csrfToken: boot.csrfToken,
    installState: boot.installState,
    i18n: boot.i18n,
    criticalLinks,
    tier2Chunks,
    cspNonce: ctx.cspNonce,
    nowIso,
    ...(boot.rum === null ? {} : { rum: boot.rum }),
  }
}

export function shouldRevalidate({ formAction, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formAction) {
    return defaultShouldRevalidate
  }
  return false
}

type RootLoaderData = Route.ComponentProps['loaderData']

export function Layout({ children }: { children: ReactNode }) {
  const rootData = useRouteLoaderData<RootLoaderData>('root')
  const facts = useMemo(() => documentFactsFrom(rootData), [rootData])
  const wantsPostFonts = useMatches().some((m) => isRecord(m.handle) && m.handle.postFonts === true)
  const nonce = rootData?.cspNonce

  return (
    <DocumentShell
      facts={facts}
      postFonts={wantsPostFonts}
      head={
        <>
          <Meta />
          <Links />
          {isWebmentionReceiveEnabled(rootData?.blogSettings) && <link rel="webmention" href="/webmention" />}
          {(rootData?.criticalLinks ?? []).map((href) => (
            <link key={href} rel="modulepreload" href={href} />
          ))}
        </>
      }
      bodyEnd={
        <>
          <ScrollRestoration nonce={nonce} />
          <Scripts nonce={nonce} />
          <RouteWarmupScript chunks={rootData?.tier2Chunks ?? []} nonce={nonce} />
        </>
      }
    >
      {children}
    </DocumentShell>
  )
}

export type RouteHandle = {
  footer?: boolean
  postFonts?: boolean
}

export default function App({ loaderData }: Route.ComponentProps) {
  useLayoutEffect(() => {
    setCsrfToken(loaderData.csrfToken)
  }, [loaderData.csrfToken])

  const rum = loaderData.rum ?? null

  const consentRequired = rum?.clientIdentity === 'forward'
  const consent = useRumConsent()
  useRum(rum, consentRequired ? consent.decision : null)
  const showConsentBanner = consentRequired && consent.ready && consent.decision === null && !isRumDenied()
  useFocusHash()
  useIosNoZoomOnFocus()
  useChunkErrorRecovery()
  const [queryClient] = useState(() => makeQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <DocumentProviders>
        <NavigationSplash />
        <Outlet />
        {showConsentBanner ? <RumConsentBanner onAccept={consent.accept} onDecline={consent.decline} /> : null}
      </DocumentProviders>
    </QueryClientProvider>
  )
}

export function ErrorBoundary({ error, loaderData }: Route.ErrorBoundaryProps) {
  useReloadOnChunkError(error)

  const blogSettings = loaderData?.blogSettings ?? null
  const isDev = import.meta.env.DEV === true && import.meta.env.PROD !== true
  const body = <ErrorView error={error} isDev={isDev} />

  return (
    <ThemeProvider initialResolved={loaderData?.theme ?? undefined}>
      <BlogSettingsProvider value={blogSettings ?? undefined}>
        <LazyMotionConfig reducedMotion="user" transition={defaultTransition}>
          {loaderData?.i18n ? (
            <Suspense fallback={body}>
              <PublicErrorLayout currentUser={loaderData?.currentUser ?? null} pathname="/" search="">
                {body}
              </PublicErrorLayout>
            </Suspense>
          ) : (
            body
          )}
        </LazyMotionConfig>
      </BlogSettingsProvider>
    </ThemeProvider>
  )
}
