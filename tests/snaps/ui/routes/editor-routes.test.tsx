import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { Outlet, useOutletContext, createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
// SSR-render the editor route Component wrappers (loader gate, navigate
// wiring, layout context) — the TipTap editors themselves can't fully SSR,
// so assert the wrapper produces output without throwing.

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import EditorLayoutRouteRaw from '@/routes/editor/layout'
import PageEditRouteRaw from '@/routes/editor/page/edit'
import PageNewRouteRaw from '@/routes/editor/page/new'
import PostAnalyticsRouteRaw from '@/routes/editor/post/analytics'
import PostEditRouteRaw from '@/routes/editor/post/edit'
import PostNewRouteRaw from '@/routes/editor/post/new'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import { ThemeProvider } from '@/ui/lib/ThemeProvider'

// `asRoute` widens the strict ComponentProps so tests supply only the fields each route reads.
const EditorLayoutRoute = asRoute(EditorLayoutRouteRaw)
const PageEditRoute = asRoute(PageEditRouteRaw)
const PageNewRoute = asRoute(PageNewRouteRaw)
const PostAnalyticsRoute = asRoute(PostAnalyticsRouteRaw)
const PostEditRoute = asRoute(PostEditRouteRaw)
const PostNewRoute = asRoute(PostNewRouteRaw)

const CURRENT_USER = { id: '1', name: 'Alice', email: 'alice@example.com' }

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
})

describe('editor routes — Component SSR renders', () => {
  it('editor/layout forwards currentUser to its outlet', () => {
    // Probe child confirms the layout's outlet context flows through.
    const html = stableHtml(
      renderNested('/editor/post/new', {
        parent: {},
        middle: <EditorLayoutRoute loaderData={{ currentUser: CURRENT_USER }} />,
        child: <CurrentUserProbe />,
      }),
    )
    expect(html).toContain('Alice')
  })

  it('editor/post/analytics renders the post analytics chrome with title and back link', () => {
    const html = stableHtml(
      renderInRouter(
        <PostAnalyticsRoute
          loaderData={{
            post: { id: '7', title: 'Editor Post', slug: 'editor-post' },
            counters: {} as Record<string, unknown>,
            views: [],
            heatmap: [],
            initialMetrics: {},
          }}
        />,
        '/editor/post/7/analytics',
      ),
    )
    expect(html).toContain('文章分析')
    expect(html).toContain('Editor Post')
    expect(html).toContain('返回编辑器')
  })

  it('editor/post/edit mounts the PostEditorRoute loader (detail query pending → skeleton)', () => {
    // Under SSR the detail query stays pending → editor skeleton; assert the mount marker, not the error branch.
    const html = stableHtml(renderInRouter(<PostEditRoute loaderData={null} params={{ id: '7' }} />, '/editor/post/7'))
    expect(html).toContain('min-h-admin-content-min')
    expect(html).not.toContain('无法打开文章编辑器')
  })

  it('editor/post/new renders the PostEditorShell (create mode) wrapper', () => {
    const html = stableHtml(renderInRouter(<PostNewRoute loaderData={null} />, '/editor/post/new'))
    expect(html).toContain('placeholder="文章标题"')
    expect(html).toContain('aria-label="URL slug"')
    expect(html).toContain('点击「创建文章」后才会同步到服务器')
    expect(html).toContain('返回列表')
  })

  it('editor/page/edit mounts the PageEditorRoute loader (detail query pending → skeleton)', () => {
    const html = stableHtml(renderInRouter(<PageEditRoute loaderData={null} params={{ id: '3' }} />, '/editor/page/3'))
    expect(html).toContain('min-h-admin-content-min')
    expect(html).not.toContain('无法打开页面编辑器')
  })

  it('editor/page/new renders the PageEditorShell (create mode) wrapper', () => {
    const html = stableHtml(renderInRouter(<PageNewRoute loaderData={null} />, '/editor/page/new'))
    expect(html).toContain('placeholder="页面标题"')
    expect(html).toContain('aria-label="URL slug"')
    expect(html).toContain('点击「创建页面」后才会同步到服务器')
    expect(html).toContain('返回列表')
  })
})

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

function CurrentUserProbe() {
  const ctx = useOutletContext<{ currentUser?: { name: string } }>()
  return <div data-testid="probe">{ctx?.currentUser?.name ?? ''}</div>
}
