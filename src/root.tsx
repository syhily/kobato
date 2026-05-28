import type { MiddlewareFunction, ShouldRevalidateFunctionArgs } from 'react-router'

import { dehydrate, HydrationBoundary, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useLayoutEffect, useState } from 'react'
import { preconnect, prefetchDNS } from 'react-dom'
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData } from 'react-router'

import { setCsrfToken } from '@/client/api/client'
import { makeQueryClient } from '@/client/api/query-client'
import { RouteWarmupScript } from '@/client/components/RouteWarmupScript'
import { useChunkErrorRecovery, useReloadOnChunkError } from '@/client/hooks/use-chunk-error-recovery'
import { useFocusHash } from '@/client/hooks/use-focus-hash'
import { useIosNoZoomOnFocus } from '@/client/hooks/use-ios-no-zoom'
import { getRouteRequestContext } from '@/server/domains/auth/context'
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

// Order matters:
//   1. Session middleware decrypts the cookie + populates request
//      context.
//   2. Install gate redirects to `/admin/setup` when the
//      deployment hasn't been installed yet (no admin user OR no
//      `setting` row). Sits AFTER session so the gate's exemption list
//      can be reasoned about against the same context every loader sees.
//
// WordPress probe interception is NOT a root middleware. React Router
// routes a middleware throw thrown BEFORE `next()` to the ErrorBoundary
// of the *highest route with a loader* and refuses to render any
// component below it (no `loaderData` available; see RR docs §"next()
// and Error Handling"). Putting the probe filter on root would
// therefore force scanner 404s through root's `ErrorBoundary`
// and lose the synchronous `<PublicChrome>` shell that the public
// layout's boundary already provides for real 404s. Instead, the two
// routes that can legitimately receive a probe path
// (`page.detail` for single-segment `.php`/`cgi-bin`, `not-found` for
// the splat) call `assertNotWordPressDecoy()` at the top of their
// loader, so the throw originates inside a leaf loader and bubbles up
// to the public layout's `ErrorBoundary` exactly like a normal 404.
export const middleware: MiddlewareFunction<Response>[] = []

export function meta({ loaderData, matches }: Route.MetaArgs) {
  // `meta()` runs on both SSR and after every client-side navigation,
  // so we read the bundle from the explicit data path (root loader
  // payload) rather than a `globalThis` slot. The fallback chain is
  // (1) the loader's own `blogSettings`, (2) the bundle hanging off
  // the root match (matches the helper used by leaf routes), then
  // (3) the SSR-only boot-hydrated snapshot for non-React server
  // modules — none of which apply on the client, so passing
  // `undefined` lets `routeMeta()` degrade to its pre-install
  // fallback if no source has the bundle yet.
  return routeMeta(undefined, loaderData?.blogSettings ?? bundleFromMatches(matches))
}

export function loader({ request, context }: Route.LoaderArgs) {
  const { role, user, session } = getRouteRequestContext({ request, context })
  const admin = role === 'admin'
  const csrfToken = session.get('csrfToken')
  if (typeof csrfToken !== 'string') {
    throw new Error('CSRF token missing from session — session middleware must run before root loader')
  }
  // Project the authenticated user (if any) to the slim shape the
  // public chrome's UserMenu needs. Don't ship the whole SessionUser —
  // email and badge fields belong on the profile page, not in the
  // navigation bar payload.
  const currentUser = user && role ? { id: user.id, name: user.name, role } : null

  // Read the theme cookie so the SSR <html> tag carries the correct
  // class before the client bundle loads — no inline scripts needed.
  // When no cookie is present we deliberately render `<html>` without
  // a theme class so the CSS `@media (prefers-color-scheme: dark)`
  // fallback in tailwind.css can resolve the right palette for
  // noscript users. ThemeProvider sets an explicit class after
  // hydration, after which cookie precedence applies on every
  // subsequent request.
  const cookie = request.headers.get('Cookie') ?? ''
  const themeMatch = cookie.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`))
  const cookieValue = themeMatch?.[1]
  const theme: 'dark' | 'light' | null = cookieValue === 'dark' ? 'dark' : cookieValue === 'light' ? 'light' : null

  // The DB-backed blog config is serialised once per top-level request so
  // every UI component can read the live snapshot through the
  // per-section accessors. All fields (including asset / locale slices) come
  // from the in-process settings
  // snapshot, which is hydrated on server start and refreshed on every
  // admin save. The wire shape is `BlogSettingsBundle` (one bucket per
  // section) so the client provider can hand each section to its own
  // React context instead of forcing every consumer to re-render when
  // an unrelated section changes.
  //
  // `null` is possible on a fresh, uninstalled deployment — the install
  // gate above intercepts every non-install request, so this loader only
  // returns `null` when serving the install split-screen itself.
  const blogSettings = getBlogSettingsBundleSync()

  // Create a per-request QueryClient for SSR dehydration.
  const queryClient = makeQueryClient()
  const dehydratedState = dehydrate(queryClient)

  const warmupManifest = getWarmupManifest()
  const tier1Links = warmupManifest?.tier1 ?? []
  const tier2Chunks = warmupManifest ? collectTier2Chunks(warmupManifest, admin) : []

  return { admin, currentUser, blogSettings, theme, csrfToken, dehydratedState, tier1Links, tier2Chunks }
}

// The root loader ships `{ admin, blogSettings }`. Both can change at
// runtime: `admin` flips on three POST endpoints (login, setup,
// logout); `blogSettings` flips whenever an admin saves a settings page.
// Revalidate when any of those actions submit. The settings layout
// calls `useRevalidator()` after a successful oRPC mutation, so
// admin saves through other tabs are already covered.
export function shouldRevalidate({ formAction, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formAction && (formAction.startsWith('/admin/signin') || formAction.startsWith('/admin/setup'))) {
    return defaultShouldRevalidate
  }
  return false
}

export function Layout({ children }: { children: React.ReactNode }) {
  // Pull both the theme cookie and the admin-configured site-wide font
  // CSS URLs off the root loader data. `fonts` is null when the
  // settings row hasn't been seeded yet (pre-install) — in that
  // case `globalCss` is `[]` and no font `<link>` is emitted, so the
  // page falls back to the system-stack fonts declared in
  // `tailwind.css` without any pre-paint flash.
  const rootData = useRouteLoaderData<{
    admin?: boolean
    theme?: 'dark' | 'light' | null
    blogSettings?: {
      fonts?: { globalCss?: string[] } | null
      assets?: { asset?: { host?: string } | null } | null
      siteIdentity?: { locale?: string } | null
    } | null
    tier1Links?: string[]
    tier2Chunks?: string[]
    csrfToken?: string
  }>('root')
  const theme = rootData?.theme ?? null
  const globalFontCss = rootData?.blogSettings?.fonts?.globalCss ?? []
  const assetHost = rootData?.blogSettings?.assets?.asset?.host

  // Resource hints: preconnect to asset CDN and font hosts so the
  // browser can set up TCP / TLS handshakes before the stylesheet
  // `<link>`s are parsed.
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

  // Tier-1 route warmup: preload critical public route chunks
  const tier1Links = rootData?.tier1Links ?? []

  // Tier-2 idle warmup: collect chunks based on auth status
  const tier2Chunks = rootData?.tier2Chunks ?? []

  const locale = rootData?.blogSettings?.siteIdentity?.locale ?? 'zh-CN'

  return (
    <html lang={locale} className={theme ?? undefined}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content={theme ?? 'light dark'} />
        {globalFontCss.map((url) => (
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
        <ScrollRestoration />
        <Scripts />
        <RouteWarmupScript chunks={tier2Chunks} />
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
}

export default function App({ loaderData }: Route.ComponentProps) {
  // Seed the CSRF token before any child useEffect fires an oRPC call.
  useLayoutEffect(() => {
    setCsrfToken(loaderData.csrfToken)
  }, [loaderData.csrfToken])

  useFocusHash()
  // Document-scoped install — every INPUT / TEXTAREA / SELECT across
  // public + admin + login + install flows inherits the no-zoom
  // behaviour from this single mount. Per-form re-installs are
  // forbidden; see `@/client/hooks/use-ios-no-zoom` for the contract.
  useIosNoZoomOnFocus()
  // Document-scoped chunk-load-error recovery: when a previous
  // deploy's tab tries to fetch a JS / CSS chunk that the new
  // deploy no longer serves, hard-reload to pick up the new bundle.
  // Same single-install contract as the iOS hook above — never
  // re-install per route. See `@/client/hooks/use-chunk-error-recovery`.
  useChunkErrorRecovery()
  // One QueryClient per request on the server; one per browser session
  // on the client.  HydrationBoundary seeds it with the dehydrated
  // state produced by the root loader.
  const [queryClient] = useState(() => makeQueryClient())

  // The bundle flows down through `BlogSettingsProvider` (per-section
  // contexts) and the route data path (`Route.MetaArgs.matches`). On
  // the server, non-React modules read the boot-hydrated snapshot in
  // `@/server/domains/settings/snapshot`; on the client they don't run at
  // all. There is no longer a render-time `globalThis` write here.
  //
  // The chrome is owned by the matched layout route (`public.layout.tsx`,
  // `admin.layout.tsx`, or `admin.layout.tsx`). The root just renders
  // the route tree wrapped in the per-section settings contexts that UI
  // components reach for through `useSiteIdentity()` /
  // `useFooterSettings()` / etc.
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
  // A chunk error thrown during render (e.g. a `React.lazy()`
  // component whose chunk 404s after a deploy) lands here instead of
  // as an unhandled rejection, so the window-level listeners
  // installed in `App` never see it. Trigger the same reload path.
  useReloadOnChunkError(error)

  // The root `ErrorBoundary` mounts INSTEAD of `App`, so the surrounding
  // `<BlogSettingsProvider>` from `App` is not in scope. The chrome
  // below depends on the per-section accessors
  // (Header/Footer/Image/…), so we re-establish the provider here
  // using whichever bundle is reachable:
  //   1. The root loader's `loaderData.blogSettings` (when the loader ran).
  //   2. The SSR-only boot-hydrated snapshot
  //      (`getBlogSettingsBundleSync()`); this is `null` on the client
  //      because we no longer mirror the provider into `globalThis` —
  //      which is fine because the same payload is reachable through
  //      `loaderData` whenever the root loader actually ran.
  const blogSettings = loaderData?.blogSettings ?? getBlogSettingsBundleSync()

  // Body decision is shared with `routes/public/layout.tsx`'s
  // boundary via `<ErrorView />`. Keeping the body off-component
  // guarantees scanner traffic and real 404s get the same shell.
  const body = <ErrorView error={error} isDev={import.meta.env.DEV} />

  // Fallback for the (rare) case where we hit an error before any
  // request ever populated the snapshot — e.g. the root loader threw on
  // a deployment that hasn't been installed yet AND the install gate
  // somehow let the request through. Render a chrome-less message so
  // the user at least sees what went wrong instead of a blank page from
  // a strict per-section accessor throw inside the chrome.
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
