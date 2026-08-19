import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { Outlet, useOutletContext, createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
// SSR-render every admin route Component export with fixture loaderData;
// assert real rendered content, so a route that degrades into the
// router's error boundary fails instead of a vacuous length check.

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import { orpcQuery } from '@/client/api/orpc-query'
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

// `asRoute` widens the strict `Route.ComponentProps` so tests pass only
// the fields each branch reads; the settings layout's loader transitively
// pulls in the DB bootstrap — irrelevant to these snapshots.
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

// Routes that read no loaderData still get an empty object — RR7's ComponentProps requires it.
const emptyLoaderData: Record<string, unknown> = {}

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
})

/** Two-level memory router: parent renders `<Outlet context={context} />` so the node's `useOutletContext()` resolves to the fixture. */
function renderInRouterWithOutlet(node: ReactNode, initialPath: string, context: Record<string, unknown>): string {
  return renderNested(initialPath, { parent: context, middle: <>{node}</> })
}

/** Three-level router: root provides `parent` context, optional `middle` re-emits it, leaf is `child`. */
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

/** Consumes the SettingsOutletContext the layout forwards and renders the bundle's site title. */
function SettingsContextProbe() {
  const ctx = useOutletContext<{ bundle?: { siteIdentity?: { title?: string } } }>()
  const title = ctx?.bundle?.siteIdentity?.title ?? ''
  return <div data-testid="probe">{title}</div>
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
      // Under SSR the list query reports loading — assert the always-rendered header chrome.
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
      // Seed the shared query cache (same queryOptions the view uses) so SSR
      // renders real detail chrome instead of the skeleton.
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
      // Outlet wrapper keeps the seeded QueryClient in the tree; empty context suffices.
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
      // Seed the shared query cache (same queryOptions the view uses) so
      // SSR renders real detail chrome instead of the skeleton.
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
      // Layout consumes parent context and re-emits SettingsOutletContext;
      // the probe child proves the forwarding runs end-to-end.
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
      expect(html).toContain('且听书吟')
    })

    it('settings/index renders every settings section chrome (general, content, service, system groups)', () => {
      // Full bundle so every SECTION_CONFIGS render() runs.
      const html = stableHtml(
        renderInRouterWithOutlet(<SettingsIndexRoute loaderData={emptyLoaderData} />, '/admin/settings', {
          currentUser: CURRENT_USER,
          bundle: TEST_BLOG_SETTINGS_BUNDLE,
          timeZones: ['Asia/Shanghai', 'UTC'],
          masks: MASKS,
        }),
      )

      // Assert a stable nav group label plus the first section's heading.
      expect(html).toContain('通用')
      expect(html).toContain('基本信息')
    })
  })
})
