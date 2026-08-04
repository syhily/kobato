import '@kobato/shared/zod-config'
import type { MiddlewareFunction, ShouldRevalidateFunctionArgs } from 'react-router'

import { makeQueryClient } from '@kobato/client/api/query-client'
import { RouteWarmupScript } from '@kobato/client/components/RouteWarmupScript'
import { useChunkErrorRecovery, useReloadOnChunkError } from '@kobato/client/hooks/use-chunk-error-recovery'
import { useFocusHash } from '@kobato/client/hooks/use-focus-hash'
import { useIosNoZoomOnFocus } from '@kobato/client/hooks/use-ios-no-zoom'
import { defaultTransition } from '@kobato/client/lib/motion'
import { isWebmentionReceiveEnabled } from '@kobato/shared/config/getters'
import { BlogSettingsProvider } from '@kobato/shared/lib/blog-config-context'
import { bundleFromMatches, routeMeta } from '@kobato/shared/seo/meta'
import { isRecord } from '@kobato/shared/utils/type-guards'
import { LazyMotionConfig } from '@kobato/ui/components/lazy-motion'
import { ThemeProvider, THEME_COOKIE } from '@kobato/ui/lib/ThemeProvider'
import { ChunkReloadOverlay } from '@kobato/ui/public/chrome/ChunkReloadOverlay'
import { ErrorView } from '@kobato/ui/public/chrome/ErrorView'
import { NavigationSplash } from '@kobato/ui/public/chrome/NavigationSplash'
import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { preconnect, prefetchDNS } from 'react-dom'
import { Links, Meta, Outlet, redirect, Scripts, ScrollRestoration, useMatches, useRouteLoaderData } from 'react-router'
const PublicErrorLayout = lazy(() =>
  import('@kobato/ui/public/chrome/BaseLayout').then((module) => ({ default: module.BaseLayout })),
)

import {
  SESSION_COOKIE_NAME,
  SESSION_MIRROR_MAX_AGE_SECONDS,
  SESSION_TOKEN_URL_PARAM,
} from '@kobato/shared/http/session-bridge'

import { getFrontendContext } from '@/lib/frontend-context'
import { collectTier2Chunks, getCriticalChunksForPathname, getWarmupManifest } from '@/lib/warmup-manifest'
import { getPublicClient } from '@/routes/public/client'

import type { Route } from './+types/root'

export const middleware: MiddlewareFunction<Response>[] = []

export function headers() {
  return new Headers({
    'Accept-CH': 'Sec-CH-UA-Platform',
    Vary: 'Sec-CH-UA-Platform',
  })
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  return routeMeta(undefined, loaderData?.blogSettings ?? bundleFromMatches(matches))
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const fctx = getFrontendContext({ request, context })

  // Session-bridge intake (headless stage 3, plan v6 §6): after a member
  // logs in on the CORE domain, the signin redirect carries
  // `?session_token=<signed __session cookie value>` — core only appends
  // it for configured frontend origins (`api.allowedOrigins`). Mirror the
  // value into our own-domain `__session` cookie (same name + attributes
  // core uses), then redirect to the clean URL so the token never lingers
  // in the address bar. The /rpc write proxy relays this cookie to core
  // as `X-Kobato-Session-Token`, which core resolves only behind a valid
  // frontend JWT. A garbage value (not core-signed) stores a dead cookie
  // — core simply fails to parse it, so the intake needs no signature
  // check on this side.
  const url = new URL(request.url)
  const sessionToken = url.searchParams.get(SESSION_TOKEN_URL_PARAM)
  if (sessionToken !== null && sessionToken !== '') {
    const clean = new URL(url)
    clean.searchParams.delete(SESSION_TOKEN_URL_PARAM)
    return redirect(`${clean.pathname}${clean.search}${clean.hash}`, {
      headers: {
        'Set-Cookie': [
          `${SESSION_COOKIE_NAME}=${sessionToken}`,
          'Path=/',
          'HttpOnly',
          'SameSite=Lax',
          `Max-Age=${SESSION_MIRROR_MAX_AGE_SECONDS}`,
          ...(import.meta.env.PROD ? ['Secure'] : []),
        ].join('; '),
      },
    })
  }

  // Headless root: there is no frontend session, so `currentUser`/`admin`
  // are always anonymous and the CSRF token is gone (the write proxy chain
  // lands with stage 3). The settings bundle + resolved font slots arrive
  // from the core Content API's `layout` procedure — the same redacted
  // bundle and the same `resolveFontsForRender(db, fonts, true)` output the
  // single-package root loader produced in-process.
  const client = getPublicClient(fctx)
  const layoutData = await client.layout({})
  const blogSettings = layoutData.blogSettings
  const fonts = layoutData.fonts

  const cookie = request.headers.get('Cookie') ?? ''
  const themeMatch = cookie.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`))
  const cookieValue = themeMatch?.[1]
  const theme: 'dark' | 'light' | null = cookieValue === 'dark' ? 'dark' : cookieValue === 'light' ? 'light' : null

  const warmupManifest = getWarmupManifest()
  const pathname = new URL(request.url).pathname
  const criticalLinks = getCriticalChunksForPathname(pathname) ?? warmupManifest?.tier1 ?? []
  const tier2Chunks = warmupManifest
    ? collectTier2Chunks(warmupManifest, /* isAdmin */ false, new Set(criticalLinks))
    : []

  const cspNonce = fctx.cspNonce

  // Server clock for public chrome that renders dates/times (footer year,
  // sidebar calendar) — passing it down as loader data keeps SSR and
  // hydration on the same instant (repo convention, audit P2-23).
  const nowIso = new Date().toISOString()

  return {
    admin: false,
    currentUser: null,
    blogSettings,
    fonts,
    theme,
    criticalLinks,
    tier2Chunks,
    cspNonce,
    nowIso,
    // Browser-reachable core base URL (`CORE_PUBLIC_URL`) — rides in the
    // serialized loader data for the stage-3 write proxy chain; null when
    // unconfigured (SSR-only deployments).
    corePublicUrl: fctx.corePublicUrl,
  }
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
    cspNonce?: string
  }>('root')
  const theme = rootData?.theme ?? null
  const assetHost = rootData?.blogSettings?.assets?.asset?.host
  const fonts = rootData?.fonts
  const globalFonts = fonts?.global ?? []
  const postFonts = fonts?.post ?? []
  const codeFonts = fonts?.code ?? []

  const matches = useMatches()
  const wantsPostFonts = matches.some((m) => isRecord(m.handle) && m.handle.postFonts === true)
  // Post/code fonts load only on routes that render article content (they opt
  // in via `handle.postFonts`); the global slot loads on every page.
  const activePostFonts = wantsPostFonts ? postFonts : []
  const activeCodeFonts = wantsPostFonts ? codeFonts : []

  // Preconnect to every distinct host the self-hosted fonts load from.
  // Local storage resolves to 'self' (a relative URL → skipped); S3 storage
  // resolves to the asset host, which is already preconnected below.
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

  const locale = rootData?.blogSettings?.siteIdentity?.locale ?? 'zh-CN'

  // When custom fonts are configured, override the CSS font tokens on <html>
  // so the slot's family stack is prepended to the existing fallback chain
  // (an empty slot leaves the token at its stylesheet default).
  //   global → --font-body  (site-wide UI font)
  //   post   → --font-serif (article body serif font)
  //   code   → --font-code  (inline/block code monospace font)
  const htmlStyle: Record<string, string> = {}
  if (globalFonts.length > 0) {
    const stack = globalFonts.map((f) => `'${f.family}'`).join(', ')
    htmlStyle['--font-body'] =
      `${stack}, 'OPPO Sans 4.0', 'OPPO Sans', OPPOSans, 'PingFang SC', 'Lantinghei SC', 'Microsoft YaHei', 'Source Han Sans CN', -apple-system, BlinkMacSystemFont, 'HanHei SC', 'Helvetica Neue', 'Open Sans', Arial, 'Hiragino Sans GB', STHeiti, 'WenQuanYi Micro Hei', SimSun, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'`
  }
  if (activePostFonts.length > 0) {
    const stack = activePostFonts.map((f) => `'${f.family}'`).join(', ')
    htmlStyle['--font-serif'] =
      `${stack}, 'OPPO Serif SC', 'Source Han Serif SC', 'Noto Serif CJK SC', 'Songti SC', SimSun, Georgia, Times, serif`
  }
  if (activeCodeFonts.length > 0) {
    const stack = activeCodeFonts.map((f) => `'${f.family}'`).join(', ')
    htmlStyle['--font-code'] = `${stack}, 'Iosevka', monospace`
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
        {/* Self-hosted web-font packages. Each font's result.css references
            its woff2 chunks via relative paths, so a single <link> per font
            pulls the whole progressive-load cascade. Served from 'self'
            (local storage) or the asset CDN host (S3) — both CSP-safe. */}
        {globalFonts.map((f) => (f.href ? <link key={`g-${f.href}`} rel="stylesheet" href={f.href} /> : null))}
        {activePostFonts.map((f) => (f.href ? <link key={`p-${f.href}`} rel="stylesheet" href={f.href} /> : null))}
        {activeCodeFonts.map((f) => (f.href ? <link key={`c-${f.href}`} rel="stylesheet" href={f.href} /> : null))}
        <Meta />
        <Links />
        {/* W3C Webmention endpoint discovery (relative — the browser
            resolves it against the origin). Suppressed when the receive
            switch is off — `isWebmentionReceiveEnabled` is the one
            switch read shared with the SSR Link header and the 410
            gate. */}
        {isWebmentionReceiveEnabled(rootData?.blogSettings) && <link rel="webmention" href="/webmention" />}
        {criticalLinks.map((href) => (
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
  // Headless: the frontend has no session, so there is no CSRF token to
  // install (the browser RPC client sends no `X-CSRF-Token` header; the
  // write proxy chain lands with stage 3).
  useFocusHash()
  useIosNoZoomOnFocus()
  useChunkErrorRecovery()
  const [queryClient] = useState(() => makeQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initialResolved={loaderData.theme ?? undefined}>
        <BlogSettingsProvider value={loaderData.blogSettings ?? undefined}>
          <LazyMotionConfig reducedMotion="user" transition={defaultTransition}>
            <NavigationSplash />
            <Outlet />
          </LazyMotionConfig>
        </BlogSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export function ErrorBoundary({ error, loaderData }: Route.ErrorBoundaryProps) {
  useReloadOnChunkError(error)

  // Headless: no in-process settings snapshot on the frontend — the bundle
  // (when the root loader succeeded) comes from the loader data only.
  const blogSettings = loaderData?.blogSettings ?? null
  const isDev = import.meta.env.DEV === true && import.meta.env.PROD !== true
  const body = <ErrorView error={error} isDev={isDev} />

  return (
    <ThemeProvider initialResolved={loaderData?.theme ?? undefined}>
      <BlogSettingsProvider value={blogSettings ?? undefined}>
        <LazyMotionConfig reducedMotion="user" transition={defaultTransition}>
          {blogSettings ? (
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
