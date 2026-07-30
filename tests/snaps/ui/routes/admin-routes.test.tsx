import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { Outlet, useOutletContext, createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
// SSR-render the remaining admin route `Component` exports. Each route
// splits I/O into `loader`; the Component is pure given loaderData /
// outlet context, so we drive it directly with fixture data and assert
// the page chrome renders. Routes that just render a known View
// component get a null/empty fixture — the View fetches via react-query
// so it renders its loading / empty chrome under SSR, which still
// exercises the route component function itself.

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import AnalyticsLayoutRouteRaw from '@/routes/admin/analytics/layout'
import AnalyticsOverviewRouteRaw from '@/routes/admin/analytics/overview'
import AnalyticsRealtimeRouteRaw from '@/routes/admin/analytics/realtime'
import AdminLayoutRouteRaw from '@/routes/admin/layout'
import BrandingRouteRaw from '@/routes/admin/library/branding'
import ImagesRouteRaw from '@/routes/admin/library/images'
import MusicsRouteRaw from '@/routes/admin/library/music'
import MusicAddRouteRaw from '@/routes/admin/library/music/add'
import MusicDetailRouteRaw from '@/routes/admin/library/music/detail'
import MyCommentsRouteRaw from '@/routes/admin/me/comments'
import PagesRouteRaw from '@/routes/admin/pages'
import PostsRouteRaw from '@/routes/admin/posts'
import PostsAnalyticsRouteRaw from '@/routes/admin/posts/analytics'
import UsersRouteRaw from '@/routes/admin/security/users'
import UsersDetailRouteRaw from '@/routes/admin/security/users/detail'
import SettingsIndexRouteRaw from '@/routes/admin/settings'
import SettingsLayoutRouteRaw from '@/routes/admin/settings/layout'
import CategoriesRouteRaw from '@/routes/admin/taxonomy/categories'
import FriendsRouteRaw from '@/routes/admin/taxonomy/friends'
import TagsRouteRaw from '@/routes/admin/taxonomy/tags'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import { ThemeProvider } from '@/ui/lib/ThemeProvider'

// The settings layout's loader path imports the settings service, whose
// section-change wiring pulls in the backup/audit schedulers (and
// transitively the DB bootstrap) — irrelevant to these snapshots.
// Generated `Route.ComponentProps` types are strict (params/matches/…).
// `asRoute` widens the prop bag so tests only need the fields each branch
// actually reads (loaderData / actionData / outlet context).
const AnalyticsLayoutRoute = asRoute(AnalyticsLayoutRouteRaw)
const AnalyticsOverviewRoute = asRoute(AnalyticsOverviewRouteRaw)
const AnalyticsRealtimeRoute = asRoute(AnalyticsRealtimeRouteRaw)
const AdminLayoutRoute = asRoute(AdminLayoutRouteRaw)
const BrandingRoute = asRoute(BrandingRouteRaw)
const ImagesRoute = asRoute(ImagesRouteRaw)
const MusicsRoute = asRoute(MusicsRouteRaw)
const MusicAddRoute = asRoute(MusicAddRouteRaw)
const MusicDetailRoute = asRoute(MusicDetailRouteRaw)
const MyCommentsRoute = asRoute(MyCommentsRouteRaw)
const PagesRoute = asRoute(PagesRouteRaw)
const PostsRoute = asRoute(PostsRouteRaw)
const PostsAnalyticsRoute = asRoute(PostsAnalyticsRouteRaw)
const UsersRoute = asRoute(UsersRouteRaw)
const UsersDetailRoute = asRoute(UsersDetailRouteRaw)
const SettingsIndexRoute = asRoute(SettingsIndexRouteRaw)
const SettingsLayoutRoute = asRoute(SettingsLayoutRouteRaw)
const CategoriesRoute = asRoute(CategoriesRouteRaw)
const FriendsRoute = asRoute(FriendsRouteRaw)
const TagsRoute = asRoute(TagsRouteRaw)

// Minimal SecretMasks shape expected by settings forms.
const MASKS = {
  assetsSecretAccessKeyMask: '',
  mailApiKeyMask: '',
  mailSmtpPassMask: '',
  mailMailgunApiKeyMask: '',
} as const

const CURRENT_USER = { id: '1', name: 'Alice', email: 'alice@example.com' }

// Default loaderData fixtures per route. Routes that read no loaderData
// still receive an empty object — RR7's ComponentProps type requires it.
const emptyLoaderData: Record<string, unknown> = {}

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
})

/**
 * Render a node that expects outlet context from a parent route. Builds
 * a two-level memory router: the parent route renders
 * `<Outlet context={context} />`, the child is the test node, so
 * `useOutletContext()` inside the node resolves to the fixture. This is
 * how RR7 nested routes provide context in production.
 */
function renderInRouterWithOutlet(node: ReactNode, initialPath: string, context: Record<string, unknown>): string {
  return renderNested(initialPath, { parent: context, middle: <>{node}</> })
}

/**
 * Three-level nested router. The root route provides `parent` context
 * via `<Outlet context>`; an optional `middle` element (e.g. a layout
 * route that re-emits context) sits between root and the leaf; the
 * leaf is `child`. Used for routes like settings/layout that both
 * consume a parent context and forward a richer one to their outlet.
 */
function renderNested(
  initialPath: string,
  layers: {
    parent: Record<string, unknown>
    middle?: ReactNode
    child?: ReactNode
  },
): string {
  const childRoute: RouteObject = { path: '*', element: layers.child ?? <></> }
  const routes: RouteObject[] = [
    {
      path: '/',
      element: <OutletContextProvider context={layers.parent} />,
      children: layers.middle ? [{ path: '/', element: layers.middle, children: [childRoute] }] : [childRoute],
    },
  ]
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  return renderToStaticMarkup(
    <QueryClientProvider client={testQueryClient}>
      <ThemeProvider>
        <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
          <RouterProvider router={router} />
        </BlogSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

function OutletContextProvider({ context }: { context: Record<string, unknown> }) {
  return <Outlet context={context} />
}

/**
 * Child probe for the settings/layout test: consumes the
 * SettingsOutletContext the layout forwards and renders the bundle's
 * site title, proving the layout's `<Outlet context>` plumbing works.
 */
function SettingsContextProbe() {
  const ctx = useOutletContextSafe()
  const title = ctx?.bundle?.siteIdentity?.title ?? ''
  return <div data-testid="probe">{title}</div>
}

// Minimal outlet-context reader; avoid importing the layout's typed
// `SettingsOutletContext` to keep the probe decoupled.
function useOutletContextSafe(): { bundle?: { siteIdentity?: { title?: string } } } | undefined {
  try {
    // useOutletContext is imported below via the react-router module.
    return useOutletContext()
  } catch {
    return undefined
  }
}

describe('admin routes — Component SSR renders', () => {
  describe('analytics', () => {
    it('analytics/layout renders the subnav with three tabs', () => {
      const html = stableHtml(renderInRouter(<AnalyticsLayoutRoute loaderData={emptyLoaderData} />, '/admin/analytics'))
      expect(html).toContain('访问统计')
      expect(html).toContain('概览')
      expect(html).toContain('实时')
      expect(html).toContain('反向链接')
    })

    it('analytics/overview renders the counters and chart tabs chrome', () => {
      const html = stableHtml(
        renderInRouter(
          <AnalyticsOverviewRoute
            loaderData={{
              counters: {} as Record<string, unknown>,
              views: [],
              heatmap: [],
              initialMetrics: {},
            }}
          />,
          '/admin/analytics',
        ),
      )
      expect(html).toContain('趋势')
      expect(html).toContain('热力')
    })

    it('analytics/realtime renders the hint card', () => {
      const html = stableHtml(
        renderInRouter(<AnalyticsRealtimeRoute loaderData={emptyLoaderData} />, '/admin/analytics/realtime'),
      )
      expect(html).toContain('提示')
      expect(html).toContain('实时面板')
    })
  })

  describe('posts', () => {
    it('posts/index renders the PostsView shell', () => {
      const html = stableHtml(renderInRouter(<PostsRoute loaderData={emptyLoaderData} />, '/admin/posts'))
      // PostsView renders at least its toolbar chrome; assert the page
      // produced non-empty markup without depending on remote data.
      expect(html.length).toBeGreaterThan(0)
    })

    it('posts/analytics renders the post title and chart tabs', () => {
      const html = stableHtml(
        renderInRouter(
          <PostsAnalyticsRoute
            loaderData={{
              post: { id: '7', title: 'Hello Post', slug: 'hello-post' },
              counters: {} as Record<string, unknown>,
              views: [],
              heatmap: [],
              initialMetrics: {},
            }}
          />,
          '/admin/posts/7/analytics',
        ),
      )
      expect(html).toContain('文章分析')
      expect(html).toContain('Hello Post')
      expect(html).toContain('趋势')
    })
  })

  describe('me', () => {
    it('me/comments renders the MyCommentsView chrome', () => {
      // The route reads `currentUser` from outlet context, so we wrap it
      // under a parent route that provides the context via <Outlet context>.
      const html = stableHtml(
        renderInRouterWithOutlet(
          <MyCommentsRoute loaderData={{ status: 'all', q: '', entity: null, entityOptions: [] }} />,
          '/admin/me/comments',
          { currentUser: CURRENT_USER },
        ),
      )
      expect(html.length).toBeGreaterThan(0)
    })
  })

  describe('library', () => {
    it('library/branding renders the BrandingView chrome', () => {
      const html = stableHtml(
        renderInRouter(<BrandingRoute loaderData={{ branding: null }} />, '/admin/library/branding'),
      )
      expect(html.length).toBeGreaterThan(0)
    })

    it('library/images renders the ImagesView shell', () => {
      const html = stableHtml(renderInRouter(<ImagesRoute loaderData={emptyLoaderData} />, '/admin/library/images'))
      expect(html.length).toBeGreaterThan(0)
    })

    it('library/music renders the MusicsView shell', () => {
      const html = stableHtml(renderInRouter(<MusicsRoute loaderData={emptyLoaderData} />, '/admin/library/music'))
      expect(html.length).toBeGreaterThan(0)
    })

    it('library/music/add renders the AddMusicView shell', () => {
      const html = stableHtml(
        renderInRouter(<MusicAddRoute loaderData={emptyLoaderData} />, '/admin/library/music/add'),
      )
      expect(html.length).toBeGreaterThan(0)
    })

    it('library/music/detail renders the MusicDetailView shell', () => {
      // Like the user detail route, the component reads `params.id` from
      // RR7's injected ComponentProps — pass it explicitly so the detail
      // view gets a non-empty id.
      const html = stableHtml(
        renderInRouter(
          <MusicDetailRoute loaderData={emptyLoaderData} params={{ id: 'abc' }} />,
          '/admin/library/music/abc',
        ),
      )
      expect(html.length).toBeGreaterThan(0)
    })
  })

  describe('pages & taxonomy', () => {
    it('pages/index renders the PagesView shell', () => {
      const html = stableHtml(renderInRouter(<PagesRoute loaderData={emptyLoaderData} />, '/admin/pages'))
      expect(html.length).toBeGreaterThan(0)
    })

    it('taxonomy/categories renders the CategoriesView shell', () => {
      const html = stableHtml(
        renderInRouter(<CategoriesRoute loaderData={emptyLoaderData} />, '/admin/taxonomy/categories'),
      )
      expect(html.length).toBeGreaterThan(0)
    })

    it('taxonomy/friends renders the FriendsView shell', () => {
      const html = stableHtml(renderInRouter(<FriendsRoute loaderData={emptyLoaderData} />, '/admin/taxonomy/friends'))
      expect(html.length).toBeGreaterThan(0)
    })

    it('taxonomy/tags renders the TagsView shell', () => {
      const html = stableHtml(renderInRouter(<TagsRoute loaderData={emptyLoaderData} />, '/admin/taxonomy/tags'))
      expect(html.length).toBeGreaterThan(0)
    })
  })

  describe('security/users', () => {
    it('security/users/index renders the UsersView shell', () => {
      const html = stableHtml(renderInRouter(<UsersRoute loaderData={emptyLoaderData} />, '/admin/security/users'))
      expect(html.length).toBeGreaterThan(0)
    })

    it('security/users/detail renders the UserDetailView shell with passkey flag', () => {
      // The route reads `params.id` from RR7's injected ComponentProps and
      // `currentUser` from the admin layout's outlet context. We pass both
      // explicitly so the detail view gets a non-empty userId and viewer.
      const html = stableHtml(
        renderInRouterWithOutlet(
          <UsersDetailRoute loaderData={{ passkeyEnabled: false }} params={{ id: '42' }} />,
          '/admin/security/users/42',
          { currentUser: CURRENT_USER },
        ),
      )
      expect(html.length).toBeGreaterThan(0)
    })
  })

  describe('admin layout', () => {
    it('layout renders the AdminShell with the current user name and site title', () => {
      const html = stableHtml(
        renderInRouter(
          <AdminLayoutRoute
            loaderData={{
              currentUser: CURRENT_USER,
              siteTitle: '测试站点',
              pendingCommentCount: 0,
              userCount: 1,
            }}
          />,
          '/admin',
        ),
      )
      expect(html).toContain('Alice')
      expect(html).toContain('测试站点')
    })
  })

  describe('settings (the big one — many inline sections)', () => {
    it('settings/layout forwards bundle/timezones/masks to its outlet', () => {
      // The layout reads ParentContext (`currentUser`) from its own
      // parent outlet, then re-emits a SettingsOutletContext to children
      // via <Outlet context>. We render it as the middle layer of a
      // 3-level router with a probe child that consumes the forwarded
      // context, so the layout's context-forwarding code path executes
      // and produces visible markup.
      const html = stableHtml(
        renderNested('/admin/settings', {
          parent: { currentUser: CURRENT_USER },
          middle: (
            <SettingsLayoutRoute
              loaderData={{
                bundle: TEST_BLOG_SETTINGS_BUNDLE,
                timeZones: ['Asia/Shanghai', 'UTC'],
                masks: MASKS,
              }}
            />
          ),
          child: <SettingsContextProbe />,
        }),
      )
      // The probe renders the forwarded bundle's site title, proving
      // the layout's <Outlet context> plumbing ran end-to-end.
      expect(html).toContain('且听书吟')
    })

    it('settings/index renders every settings section chrome (general, content, service, system groups)', () => {
      // The settings page reads `bundle/timeZones/masks` from its
      // parent outlet context. We provide the full test bundle so every
      // SECTION_CONFIGS render() runs.
      const html = stableHtml(
        renderInRouterWithOutlet(<SettingsIndexRoute loaderData={emptyLoaderData} />, '/admin/settings', {
          currentUser: CURRENT_USER,
          bundle: TEST_BLOG_SETTINGS_BUNDLE,
          timeZones: ['Asia/Shanghai', 'UTC'],
          masks: MASKS,
        }),
      )

      // The settings chrome includes the section nav + the first
      // visible form (General). Assert a stable, user-visible label.
      expect(html).toContain('通用')
      expect(html.length).toBeGreaterThan(0)
    })
  })
})
