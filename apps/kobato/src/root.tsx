import '@/zod-config'
import type { ContentBootstrapI18n } from '@kobato/api/contracts/public/content'
import type { MiddlewareFunction, ShouldRevalidateFunctionArgs } from 'react-router'

import { bundleFromMatches, i18nFromMatches, routeMeta } from '@kobato/catalog/seo/meta'
import { catalogScopeForPathname } from '@kobato/i18n/catalog-scope'
import { fallbackMessages } from '@kobato/i18n/fallback-messages'
import { DEFAULT_LOCALE, type AppLocale } from '@kobato/i18n/locales'
import { createSsrCaller } from '@kobato/server/http/ssr-caller'
import { documentHeaders } from '@kobato/server/infra/http/headers'
import { activeFrontendRum } from '@kobato/server/infra/trace/config'
import { traceRouteMiddleware } from '@kobato/server/infra/trace/react-router'
import { getCriticalChunksForPathname, getWarmupManifest } from '@kobato/server/render/warmup/manifest'
import { getBlogSettingsBundleSync, isWebmentionReceiveEnabled } from '@kobato/settings/getters'
import { LazyMotionConfig } from '@kobato/ui/components/lazy-motion'
import { defaultFontStackFor } from '@kobato/ui/lib/font-stacks'
import { I18nProvider } from '@kobato/ui/lib/I18nProvider'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider'
import { isRecord } from '@kobato/utils/type-guards'
import { setCsrfToken } from '@kobato/web-client/api/client'
import { makeQueryClient } from '@kobato/web-client/api/query-client'
import { useChunkErrorRecovery, useReloadOnChunkError } from '@kobato/web-client/hooks/use-chunk-error-recovery'
import { useFocusHash } from '@kobato/web-client/hooks/use-focus-hash'
import { useIosNoZoomOnFocus } from '@kobato/web-client/hooks/use-ios-no-zoom'
import { useRum, isRumDenied } from '@kobato/web-client/hooks/use-rum'
import { useRumConsent } from '@kobato/web-client/hooks/use-rum-consent'
import { defaultTransition } from '@kobato/web-client/lib/motion'
import { RouteWarmupScript } from '@kobato/web-client/route-warmup/RouteWarmupScript'
import { BlogSettingsProvider } from '@kobato/web-client/settings/blog-settings-context'
import { ChunkReloadOverlay } from '@kobato/web-public/ui/chrome/ChunkReloadOverlay'
import { ErrorView } from '@kobato/web-public/ui/chrome/ErrorView'
import { NavigationSplash } from '@kobato/web-public/ui/chrome/NavigationSplash'
import { RumConsentBanner } from '@kobato/web-public/ui/chrome/RumConsentBanner'
import { LocaleSyncProvider } from '@kobato/web-public/ui/lib/LocaleSyncProvider'
import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useLayoutEffect, useState } from 'react'
import { preconnect, prefetchDNS } from 'react-dom'
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useMatches, useRouteLoaderData } from 'react-router'
import '@kobato/ui/styles/ui.css'

const PublicErrorLayout = lazy(() =>
  Promise.all([import('@/styles/public.css'), import('@kobato/web-public/ui/chrome/BaseLayout')]).then(
    ([, module]) => ({ default: module.BaseLayout }),
  ),
)

import type { Route } from './+types/root'

function collectTier2Chunks(
  manifest: {
    tier2_public: string[]
    tier2_admin: string[]
    tier2_editor: string[]
    tier2_auth: string[]
  },
  isAdmin: boolean,
  criticalSet: Set<string>,
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const push = (arr: string[]) => {
    for (const c of arr) {
      if (!seen.has(c) && !criticalSet.has(c)) {
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

export const middleware: MiddlewareFunction<Response>[] = [traceRouteMiddleware]

export const headers = documentHeaders

export function meta({ loaderData, matches }: Route.MetaArgs) {
  return routeMeta(
    undefined,
    loaderData?.blogSettings ?? bundleFromMatches(matches),
    loaderData?.i18n ?? i18nFromMatches(matches),
  )
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller, cspNonce } = createSsrCaller({ request, context })

  const boot = await caller.public.content.bootstrap()

  const rum = activeFrontendRum()

  const warmupManifest = getWarmupManifest()
  const pathname = new URL(request.url).pathname
  const criticalLinks = getCriticalChunksForPathname(pathname) ?? warmupManifest?.tier1 ?? []
  const tier2Chunks = warmupManifest ? collectTier2Chunks(warmupManifest, boot.admin, new Set(criticalLinks)) : []

  const nowIso = new Date().toISOString()

  return {
    admin: boot.admin,
    currentUser: boot.currentUser,
    blogSettings: boot.blogSettings,
    fonts: boot.fonts,
    theme: boot.theme,
    csrfToken: boot.csrfToken,
    i18n: boot.i18n,
    criticalLinks,
    tier2Chunks,
    cspNonce,
    nowIso,
    ...(rum === null ? {} : { rum }),
  }
}

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formAction,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formAction) {
    return defaultShouldRevalidate
  }
  return catalogScopeForPathname(currentUrl.pathname) !== catalogScopeForPathname(nextUrl.pathname)
}

export function Layout({ children }: { children: React.ReactNode }) {
  const rootData = useRouteLoaderData<{
    admin?: boolean
    theme?: 'dark' | 'light' | null
    blogSettings?: {
      assets?: { asset?: { host?: string; scheme?: 'http' | 'https' } | null } | null
      siteIdentity?: { locale?: string } | null
      webmentions?: { webmention?: { receiveEnabled?: boolean } } | null
    } | null
    criticalLinks?: string[]
    fonts?: {
      global: { family: string; href: string }[]
      post: { family: string; href: string }[]
      code: { family: string; href: string }[]
    } | null
    tier2Chunks?: string[]
    csrfToken?: string
    cspNonce?: string
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

  const criticalLinks = rootData?.criticalLinks ?? []
  const tier2Chunks = rootData?.tier2Chunks ?? []

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
        {isWebmentionReceiveEnabled(rootData?.blogSettings) && <link rel="webmention" href="/webmention" />}
        {criticalLinks.map((href) => (
          <link key={href} rel="modulepreload" href={href} />
        ))}
      </head>
      <body>
        <I18nProvider locale={locale} messages={messages}>
          {children}
          <ChunkReloadOverlay />
          <ScrollRestoration nonce={rootData?.cspNonce} />
          <Scripts nonce={rootData?.cspNonce} />
          <RouteWarmupScript chunks={tier2Chunks} nonce={rootData?.cspNonce} />
        </I18nProvider>
      </body>
    </html>
  )
}

export type RouteHandle = {
  layout?: 'admin'
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

  const i18n = loaderData.i18n
  const locale = i18n?.locale ?? DEFAULT_LOCALE

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initialResolved={loaderData.theme ?? undefined}>
        <BlogSettingsProvider value={loaderData.blogSettings ?? undefined}>
          <LazyMotionConfig reducedMotion="user" transition={defaultTransition}>
            <LocaleSyncProvider locale={locale} revision={i18n?.revision}>
              <NavigationSplash />
              <Outlet />
              {showConsentBanner ? <RumConsentBanner onAccept={consent.accept} onDecline={consent.decline} /> : null}
            </LocaleSyncProvider>
          </LazyMotionConfig>
        </BlogSettingsProvider>
      </ThemeProvider>
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
