import '@/shared/zod-config'
import type { MiddlewareFunction, ShouldRevalidateFunctionArgs } from 'react-router'

import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useLayoutEffect, useState } from 'react'
import { preconnect, prefetchDNS } from 'react-dom'
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useMatches, useRouteLoaderData } from 'react-router'

import type { ContentBootstrapI18n } from '@/shared/contracts/content'

import { setCsrfToken } from '@/client/api/client'
import { makeQueryClient } from '@/client/api/query-client'
import { RouteWarmupScript } from '@/client/components/RouteWarmupScript'
import { useChunkErrorRecovery, useReloadOnChunkError } from '@/client/hooks/use-chunk-error-recovery'
import { useFocusHash } from '@/client/hooks/use-focus-hash'
import { useIosNoZoomOnFocus } from '@/client/hooks/use-ios-no-zoom'
import { useRum, isRumDenied } from '@/client/hooks/use-rum'
import { useRumConsent } from '@/client/hooks/use-rum-consent'
import { defaultTransition } from '@/client/lib/motion'
import { createSsrCaller } from '@/server/http/ssr-caller'
import { documentHeaders } from '@/server/infra/http/headers'
import { activeFrontendRum } from '@/server/infra/trace/config'
import { traceRouteMiddleware } from '@/server/infra/trace/react-router'
import { getCriticalChunksForPathname, getWarmupManifest } from '@/server/render/warmup/manifest'
import { defaultFontStackFor } from '@/shared/config/font-stacks'
import { getBlogSettingsBundleSync, isWebmentionReceiveEnabled } from '@/shared/config/getters'
import { catalogScopeForPathname } from '@/shared/i18n/catalog-scope'
import { fallbackMessages } from '@/shared/i18n/fallback-messages'
import { DEFAULT_LOCALE, type AppLocale } from '@/shared/i18n/locales'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import { bundleFromMatches, i18nFromMatches, routeMeta } from '@/shared/seo/meta'
import { isRecord } from '@/shared/utils/type-guards'
import { LazyMotionConfig } from '@/ui/components/lazy-motion'
import { I18nProvider } from '@/ui/lib/I18nProvider'
import { LocaleSyncProvider } from '@/ui/lib/LocaleSyncProvider'
import { ThemeProvider } from '@/ui/lib/ThemeProvider'
import { ChunkReloadOverlay } from '@/ui/public/chrome/ChunkReloadOverlay'
import { ErrorView } from '@/ui/public/chrome/ErrorView'
import { NavigationSplash } from '@/ui/public/chrome/NavigationSplash'
import { RumConsentBanner } from '@/ui/public/chrome/RumConsentBanner'
const PublicErrorLayout = lazy(() =>
  import('@/ui/public/chrome/BaseLayout').then((module) => ({ default: module.BaseLayout })),
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

// Root middleware wraps loaders/actions and the SSR entry, so one document/`.data` span covers the whole request.
export const middleware: MiddlewareFunction<Response>[] = [traceRouteMiddleware]

// Root is the nearest error boundary for loader-thrown 304s; this passes the
// thrown Response's representation headers through RR's header rebuild.
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

  // Boot data loads through the content API like every public route; the theme cookie is parsed inside.
  const boot = await caller.content.bootstrap()

  // The browser bootstrap exists only once the settings projection and the runtime's OpenObserve pipeline
  // verification pass; otherwise the key is omitted entirely and the server authorization header never reaches it.
  const rum = activeFrontendRum()

  const warmupManifest = getWarmupManifest()
  const pathname = new URL(request.url).pathname
  const criticalLinks = getCriticalChunksForPathname(pathname) ?? warmupManifest?.tier1 ?? []
  const tier2Chunks = warmupManifest ? collectTier2Chunks(warmupManifest, boot.admin, new Set(criticalLinks)) : []

  // Server clock for public chrome: loader data keeps SSR and hydration on the same instant.
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

/**
 * Revalidate when a navigation crosses the document-scope message catalog boundary (`public` vs `workspace`);
 * otherwise client-side navigation keeps the previous scope's catalog and renders missing admin messages.
 */
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
      assets?: { asset?: { host?: string } | null } | null
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
  const assetHost = rootData?.blogSettings?.assets?.asset?.host
  const fonts = rootData?.fonts
  const globalFonts = fonts?.global ?? []
  const postFonts = fonts?.post ?? []
  const codeFonts = fonts?.code ?? []

  const matches = useMatches()
  const wantsPostFonts = matches.some((m) => isRecord(m.handle) && m.handle.postFonts === true)
  const activePostFonts = wantsPostFonts ? postFonts : []
  const activeCodeFonts = wantsPostFonts ? codeFonts : []

  // Preconnect to every distinct host the self-hosted fonts load from ('self' relative URLs are skipped).
  const fontHosts = new Set<string>()
  for (const f of [...globalFonts, ...activePostFonts, ...activeCodeFonts]) {
    if (!f.href) {
      continue
    }
    try {
      const host = new URL(f.href).host
      if (host) {
        fontHosts.add(host)
      }
    } catch {
      // Relative URL (local 'self') — nothing to preconnect.
    }
  }

  if (assetHost) {
    fontHosts.add(assetHost)
    preconnect(`https://${assetHost}`, { crossOrigin: 'anonymous' })
  }
  for (const host of fontHosts) {
    preconnect(`https://${host}`)
    prefetchDNS(`https://${host}`)
  }

  const criticalLinks = rootData?.criticalLinks ?? []
  const tier2Chunks = rootData?.tier2Chunks ?? []

  // `fallbackMessages` is the only synchronous message module the client may import directly; the full catalog
  // arrives as loader data.
  const i18n = rootData?.i18n ?? null
  const locale: AppLocale = i18n?.locale ?? DEFAULT_LOCALE
  const messages = i18n?.messages ?? fallbackMessages

  // Custom fonts prepend to the locale's default fallback chain (`defaultFontStackFor`, the same map the
  // CSS `:lang()` branches use).
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
        {/* Self-hosted web-font packages: one <link> per font pulls the whole woff2 cascade (self/S3 — both CSP-safe). */}
        {globalFonts.map((f) => (f.href ? <link key={`g-${f.href}`} rel="stylesheet" href={f.href} /> : null))}
        {activePostFonts.map((f) => (f.href ? <link key={`p-${f.href}`} rel="stylesheet" href={f.href} /> : null))}
        {activeCodeFonts.map((f) => (f.href ? <link key={`c-${f.href}`} rel="stylesheet" href={f.href} /> : null))}
        <Meta />
        <Links />
        {/* W3C Webmention endpoint discovery (relative — resolved against the origin). Same switch as the SSR Link header and the 410 gate. */}
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

// `handle.layout = 'admin'` marks routes that own their chrome (admin SPA, login/install split-screen).
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
  // The consent gate applies only when the relay forwards request identity; in `anonymous` mode the decision is
  // irrelevant and RUM starts consent-free. The banner renders only after the post-mount storage read (`ready`),
  // so SSR and the first client render agree (no hydration flash), and DNT/GPC visitors are never asked.
  const consentRequired = rum?.clientIdentity === 'forward'
  const consent = useRumConsent()
  // Anonymous mode never consults the decision; passing a constant keeps a
  // consent change from retriggering the RUM effect there.
  useRum(rum, consentRequired ? consent.decision : null)
  const showConsentBanner = consentRequired && consent.ready && consent.decision === null && !isRumDenied()
  useFocusHash()
  useIosNoZoomOnFocus()
  useChunkErrorRecovery()
  const [queryClient] = useState(() => makeQueryClient())
  // `i18n` is required by the loader contract; the fallback keeps a hand-built
  // loaderData (tests, error-recovery remounts) from crashing the provider.
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
          {/* Full chrome only with a complete i18n payload; a root-loader failure renders the minimal ErrorView
              over the fallback messages. */}
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
