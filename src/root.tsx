import '@/shared/zod-config'
import type { MiddlewareFunction, ShouldRevalidateFunctionArgs } from 'react-router'

import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useLayoutEffect, useState } from 'react'
import { preconnect, prefetchDNS } from 'react-dom'
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useMatches, useRouteLoaderData } from 'react-router'

import { setCsrfToken } from '@/client/api/client'
import { makeQueryClient } from '@/client/api/query-client'
import { RouteWarmupScript } from '@/client/components/RouteWarmupScript'
import { useChunkErrorRecovery, useReloadOnChunkError } from '@/client/hooks/use-chunk-error-recovery'
import { useFocusHash } from '@/client/hooks/use-focus-hash'
import { useIosNoZoomOnFocus } from '@/client/hooks/use-ios-no-zoom'
import { defaultTransition } from '@/client/lib/motion'
import { resolveFontsForRender } from '@/server/domains/fonts/services/render'
import { redactSecretsFromBundle } from '@/server/domains/settings/services/core'
import { getRequestContext } from '@/server/http/request-context'
import { getCriticalChunksForPathname, getWarmupManifest } from '@/server/render/warmup/manifest'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import { bundleFromMatches, routeMeta } from '@/shared/seo/meta'
import { isRecord } from '@/shared/utils/type-guards'
import { ThemeProvider, THEME_COOKIE } from '@/ui/lib/ThemeProvider'
import { ChunkReloadOverlay } from '@/ui/public/chrome/ChunkReloadOverlay'
import { ErrorView } from '@/ui/public/chrome/ErrorView'
import { NavigationSplash } from '@/ui/public/chrome/NavigationSplash'
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
  const rc = getRequestContext({ request, context })
  const { session } = rc
  const role = rc.viewer?.role ?? null
  const user = rc.viewer ?? undefined
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

  const rawBundle = getBlogSettingsBundleSync()
  const blogSettings = rawBundle ? redactSecretsFromBundle(rawBundle) : null

  // Resolve the configured font-id slots into browser-ready {family, href}
  // lists so `<head>` can emit one self-hosted `<link>` per font without a
  // second round-trip. Post/code fonts are resolved eagerly (the root layout
  // can't know which child routes opt in via `handle.postFonts` until render)
  // but only rendered when the matched route opts in — see the Layout below.
  // `rc.db` is read lazily so a missing bundle never touches the
  // request db.
  const fonts = blogSettings?.fonts
    ? await resolveFontsForRender(rc.db, blogSettings.fonts, /* wantsPostFonts */ true)
    : null

  const warmupManifest = getWarmupManifest()
  const pathname = new URL(request.url).pathname
  const criticalLinks = getCriticalChunksForPathname(pathname) ?? warmupManifest?.tier1 ?? []
  const tier2Chunks = warmupManifest ? collectTier2Chunks(warmupManifest, admin, new Set(criticalLinks)) : []

  const cspNonce = rc.cspNonce

  return { admin, currentUser, blogSettings, fonts, theme, csrfToken, criticalLinks, tier2Chunks, cspNonce }
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
  useLayoutEffect(() => {
    setCsrfToken(loaderData.csrfToken)
  }, [loaderData.csrfToken])

  useFocusHash()
  useIosNoZoomOnFocus()
  useChunkErrorRecovery()
  const [queryClient] = useState(() => makeQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initialResolved={loaderData.theme ?? undefined}>
        <BlogSettingsProvider value={loaderData.blogSettings ?? undefined}>
          <MotionConfig reducedMotion="user" transition={defaultTransition}>
            <NavigationSplash />
            <Outlet />
          </MotionConfig>
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
        <MotionConfig reducedMotion="user" transition={defaultTransition}>
          {blogSettings ? (
            <Suspense fallback={body}>
              <PublicErrorLayout currentUser={loaderData?.currentUser ?? null} pathname="/" search="">
                {body}
              </PublicErrorLayout>
            </Suspense>
          ) : (
            body
          )}
        </MotionConfig>
      </BlogSettingsProvider>
    </ThemeProvider>
  )
}
