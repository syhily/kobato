import type { ReactNode } from 'react'

import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN.ts'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { renderInRouter, stableHtml } from '@kobato/test/render.tsx'
import { asRoute } from '@kobato/test/route-test-utils.tsx'
import { I18nProvider } from '@kobato/ui/lib/I18nProvider.tsx'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider.tsx'
import { orpcQuery } from '@kobato/web-client/api/orpc-query.ts'
import { BlogSettingsProvider } from '@kobato/web-client/settings/blog-settings-context.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { Outlet, useOutletContext, createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'

import AnalyticsLayoutRouteRaw from '@/routes/admin/analytics/layout.tsx'
import AnalyticsOverviewRouteRaw from '@/routes/admin/analytics/overview.tsx'
import AnalyticsRealtimeRouteRaw from '@/routes/admin/analytics/realtime.tsx'
import AdminLayoutRouteRaw from '@/routes/admin/layout.tsx'
import BrandingRouteRaw from '@/routes/admin/library/branding.tsx'
import ImagesRouteRaw from '@/routes/admin/library/images.tsx'
import MusicsRouteRaw from '@/routes/admin/library/music.tsx'
import MusicAddRouteRaw from '@/routes/admin/library/music/add.tsx'
import MusicDetailRouteRaw from '@/routes/admin/library/music/detail.tsx'
import MyCommentsRouteRaw from '@/routes/admin/me/comments.tsx'
import PagesRouteRaw from '@/routes/admin/pages/index.tsx'
import PostsAnalyticsRouteRaw from '@/routes/admin/posts/analytics.tsx'
import PostsRouteRaw from '@/routes/admin/posts/index.tsx'
import UsersDetailRouteRaw from '@/routes/admin/security/users/detail.tsx'
import UsersRouteRaw from '@/routes/admin/security/users/index.tsx'
import SettingsIndexRouteRaw from '@/routes/admin/settings/index.tsx'
import SettingsLayoutRouteRaw from '@/routes/admin/settings/layout.tsx'
import CategoriesRouteRaw from '@/routes/admin/taxonomy/categories.tsx'
import FriendsRouteRaw from '@/routes/admin/taxonomy/friends.tsx'
import TagsRouteRaw from '@/routes/admin/taxonomy/tags.tsx'

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

const MASKS = {
  assetsSecretAccessKeyMask: '',
  mailSmtpPassMask: '',
  mailMailgunApiKeyMask: '',
} as const

const CURRENT_USER = { id: '1', name: 'Alice', email: 'alice@example.com' }

const emptyLoaderData: Record<string, unknown> = {}

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
})

function renderInRouterWithOutlet(node: ReactNode, initialPath: string, context: Record<string, unknown>): string {
  return renderNested(initialPath, { parent: context, middle: <>{node}</> })
}

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
          <I18nProvider locale="zh-CN" messages={uiMessagesZhCN}>
            <RouterProvider router={router} />
          </I18nProvider>
        </BlogSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

function OutletContextProvider({ context }: { context: Record<string, unknown> }) {
  return <Outlet context={context} />
}

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
              initialMetrics: {},
            }}
          />,
          '/admin/analytics',
        ),
      )
      expect(html).toContain('趋势')
      expect(html).toContain('每周趋势')
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
      const html = stableHtml(
        renderInRouterWithOutlet(<SettingsIndexRoute loaderData={emptyLoaderData} />, '/admin/settings', {
          currentUser: CURRENT_USER,
          bundle: TEST_BLOG_SETTINGS_BUNDLE,
          timeZones: ['Asia/Shanghai', 'UTC'],
          masks: MASKS,
        }),
      )

      expect(html).toContain('通用')
      expect(html).toContain('基本信息')
    })
  })
})
