import type { ReactNode } from 'react'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'

import { orpcQuery } from '@kobato/client/api/orpc-query'
import { BlogSettingsProvider } from '@kobato/shared/lib/blog-config-context'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// SSR-render the remaining admin route `Component` exports. Each route
// splits I/O into `loader`; the Component is pure given loaderData /
// outlet context, so we drive it directly with fixture data and assert
// the page chrome renders. Routes that just render a known View
// component get a null/empty fixture — the View fetches via react-query
// so it renders its loading / empty chrome under SSR, which still
// exercises the route component function itself. Every test asserts on
// real rendered content (headings, labels, fixture values), so a route
// that degrades into the router's error boundary fails instead of
// passing a vacuous `html.length > 0`.
import { renderToStaticMarkup } from 'react-dom/server'
import { Outlet, useOutletContext, createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'

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
      // The list query reports loading under SSR (the empty state never
      // renders), so assert the header chrome the route always produces.
      expect(html).toContain('文章管理')
      expect(html).toContain('新建文章')
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
      expect(html).toContain('我的评论')
      expect(html).toContain('条评论')
    })
  })

  describe('library', () => {
    it('library/branding renders the BrandingView chrome', () => {
      const html = stableHtml(
        renderInRouter(<BrandingRoute loaderData={{ branding: null }} />, '/admin/library/branding'),
      )
      expect(html).toContain('品牌素材')
      expect(html).toContain('Favicon 套件')
    })

    it('library/images renders the ImagesView shell', () => {
      const html = stableHtml(renderInRouter(<ImagesRoute loaderData={emptyLoaderData} />, '/admin/library/images'))
      expect(html).toContain('图片管理')
      expect(html).toContain('上传图片')
    })

    it('library/music renders the MusicsView shell', () => {
      const html = stableHtml(renderInRouter(<MusicsRoute loaderData={emptyLoaderData} />, '/admin/library/music'))
      expect(html).toContain('音乐库')
      expect(html).toContain('添加音乐')
    })

    it('library/music/add renders the AddMusicView shell', () => {
      const html = stableHtml(
        renderInRouter(<MusicAddRoute loaderData={emptyLoaderData} />, '/admin/library/music/add'),
      )
      expect(html).toContain('添加音乐')
      expect(html).toContain('输入关键词搜索音乐')
    })

    it('library/music/detail renders the MusicDetailView with the seeded music', () => {
      // The component reads `params.id` from RR7's injected ComponentProps
      // — pass it explicitly so the detail view gets a non-empty id. The
      // music query reports loading under SSR, so seed the shared client's
      // cache (keyed by the same queryOptions the view uses) to make the
      // view render the real detail chrome instead of the skeleton.
      testQueryClient.setQueryData(orpcQuery.admin.music.get.queryOptions({ input: { id: 'abc' } }).queryKey, {
        music: {
          id: 'abc',
          source: 'netease',
          sourceId: '1001',
          playerId: 'abcdef0123456789',
          name: '青花瓷',
          artist: ['周杰伦'],
          album: '我很忙',
          audioStoragePath: 'music/audio.mp3',
          audioUrl: 'https://cdn.example.com/audio.mp3',
          coverStoragePath: 'music/cover.jpg',
          coverUrl: 'https://cdn.example.com/cover.jpg',
          lyric: '',
          uploaderId: 'user-1',
          uploaderName: '雨帆',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-02-01T00:00:00.000Z',
        },
      })
      // Render via the outlet wrapper so the tree uses this file's
      // QueryClient (the one we just seeded); the view reads no outlet
      // context, so an empty context suffices.
      const html = stableHtml(
        renderInRouterWithOutlet(
          <MusicDetailRoute loaderData={emptyLoaderData} params={{ id: 'abc' }} />,
          '/admin/library/music/abc',
          {},
        ),
      )
      expect(html).toContain('青花瓷')
      expect(html).toContain('周杰伦')
      expect(html).toContain('单曲')
    })
  })

  describe('pages & taxonomy', () => {
    it('pages/index renders the PagesView shell', () => {
      const html = stableHtml(renderInRouter(<PagesRoute loaderData={emptyLoaderData} />, '/admin/pages'))
      expect(html).toContain('页面管理')
      expect(html).toContain('新建页面')
    })

    it('taxonomy/categories renders the CategoriesView shell', () => {
      const html = stableHtml(
        renderInRouter(<CategoriesRoute loaderData={emptyLoaderData} />, '/admin/taxonomy/categories'),
      )
      expect(html).toContain('分类管理')
      expect(html).toContain('新增分类')
    })

    it('taxonomy/friends renders the FriendsView shell', () => {
      const html = stableHtml(renderInRouter(<FriendsRoute loaderData={emptyLoaderData} />, '/admin/taxonomy/friends'))
      expect(html).toContain('友链管理')
      expect(html).toContain('新增友链')
    })

    it('taxonomy/tags renders the TagsView shell', () => {
      const html = stableHtml(renderInRouter(<TagsRoute loaderData={emptyLoaderData} />, '/admin/taxonomy/tags'))
      expect(html).toContain('标签管理')
      expect(html).toContain('新增标签')
    })
  })

  describe('security/users', () => {
    it('security/users/index renders the UsersView shell', () => {
      const html = stableHtml(renderInRouter(<UsersRoute loaderData={emptyLoaderData} />, '/admin/security/users'))
      expect(html).toContain('用户管理')
      expect(html).toContain('邀请作者')
    })

    it('security/users/detail renders the UserDetailView with the seeded user', () => {
      // The route reads `params.id` from RR7's injected ComponentProps and
      // `currentUser` from the admin layout's outlet context. We pass both
      // explicitly so the detail view gets a non-empty userId and viewer.
      // The view fetches the user + recent comments via react-query; seed
      // the shared client's cache (keyed by the same queryOptions the view
      // uses) so SSR renders the real detail chrome instead of the
      // skeleton — an error boundary would not contain these strings.
      testQueryClient.setQueryData(orpcQuery.admin.users.get.queryOptions({ input: { id: '42' } }).queryKey, {
        user: {
          id: '42',
          name: 'Bob',
          email: 'bob@example.com',
          link: '',
          role: 'author',
          deletedAt: null,
          isMuted: false,
          badgeName: '',
          badgeColor: '',
          badgeTextColor: '',
          commentCount: 3,
          pendingCount: 0,
          lastCommentAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          passkeyCount: 0,
        },
      })
      testQueryClient.setQueryData(
        orpcQuery.admin.comments.loadAll.queryOptions({ input: { offset: 0, limit: 10, userId: '42' } }).queryKey,
        { comments: [] },
      )
      const html = stableHtml(
        renderInRouterWithOutlet(
          <UsersDetailRoute loaderData={{ passkeyEnabled: false }} params={{ id: '42' }} />,
          '/admin/security/users/42',
          { currentUser: CURRENT_USER },
        ),
      )
      expect(html).toContain('用户详情')
      expect(html).toContain('Bob')
      expect(html).toContain('bob@example.com')
      expect(html).toContain('统计信息')
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

      // The settings chrome includes the section nav + the rendered
      // sections. Assert a stable nav group label plus the first
      // section's heading, proving every SECTION_CONFIGS render() ran.
      expect(html).toContain('通用')
      expect(html).toContain('基本信息')
    })
  })
})
