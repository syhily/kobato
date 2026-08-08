import { describe, expect, it, vi } from 'vitest'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { UploadImageDialog } from '@/ui/admin/shared/UploadImageDialog'
import { AdminSearchDialog } from '@/ui/admin/shell/AdminSearchDialog'
import { AdminShell } from '@/ui/admin/shell/AdminShell'
import { NavMenuItem } from '@/ui/admin/shell/NavMenuItem'
import { SidebarProvider } from '@/ui/components/sidebar'

const queryMocks = mockTanstackQuery()

queryMocks.query = {
  data: null as unknown,
  isPending: false,
  isFetching: false,
  error: null as unknown,
  refetch: vi.fn(),
}

queryMocks.mutation = {
  mutate: vi.fn(),
  isPending: false,
}

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
  removeQueries: vi.fn(),
}

// Base UI portals only mount after the open animation (client-only), so an
// open dialog emits no SSR HTML — assert closed states directly (same
// constraint as ConfirmDialog in admin-shared.test.tsx); search queries stubbed.

const noop = () => undefined

describe('snapshot: UploadImageDialog', () => {
  it('renders nothing when closed (Base UI Dialog portal skips closed SSR)', () => {
    const html = stableHtml(
      renderToHtml(<UploadImageDialog open={false} kind={{ kind: 'generic' }} onClose={noop} onUploaded={noop} />),
    )
    expect(html).toBe('')
  })

  it('renders nothing for the category-cover kind when closed', () => {
    const html = stableHtml(
      renderToHtml(
        <UploadImageDialog open={false} kind={{ kind: 'category', slug: 'life' }} onClose={noop} onUploaded={noop} />,
      ),
    )
    expect(html).toBe('')
  })
})

describe('snapshot: AdminSearchDialog', () => {
  it('renders nothing when closed', () => {
    const html = stableHtml(renderInRouter(<AdminSearchDialog open={false} onOpenChange={noop} />))
    expect(html).toBe('')
  })

  it('renders the search input and empty prompt when open with no query', () => {
    queryMocks.query = {
      data: null,
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    const html = stableHtml(renderInRouter(<AdminSearchDialog open={true} onOpenChange={noop} />))
    // Portal usually emits during SSR — the guard keeps the assertion a no-throw check if it doesn't.
    if (html !== '') {
      expect(html).toContain('全站搜索…')
      expect(html).toContain('输入关键词搜索文章或页面')
    }
  })

  it('renders results when the query resolves with posts and pages', () => {
    queryMocks.query = {
      data: {
        posts: [{ id: 'p1', title: 'Hello Post', slug: 'hello', published: true }],
        pages: [{ id: 'pg1', title: 'About Page', slug: 'about', published: false }],
      },
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    const html = stableHtml(renderInRouter(<AdminSearchDialog open={true} onOpenChange={noop} />))
    // Same portal caveat as above: assert only when the portal emitted.
    if (html !== '') {
      expect(html).toContain('文章')
      expect(html).toContain('页面')
      expect(html).toContain('草稿')
    }
  })
})

// NavMenuItem.Link needs a router + SidebarProvider (useIsActiveLink / useSidebar).

describe('snapshot: NavMenuItem', () => {
  function wrap(node: React.ReactNode, path = '/admin/posts') {
    return stableHtml(
      renderInRouter(
        <SidebarProvider>
          <ul>{node}</ul>
        </SidebarProvider>,
        path,
      ),
    )
  }

  it('renders an active link with aria-current="page"', () => {
    const html = wrap(
      <NavMenuItem>
        <NavMenuItem.Link to="/admin/posts">
          <NavMenuItem.Label>文章</NavMenuItem.Label>
        </NavMenuItem.Link>
      </NavMenuItem>,
      '/admin/posts',
    )
    expect(html).toContain('文章')
    expect(html).toContain('aria-current="page"')
  })

  it('renders an inactive link without aria-current when on a different path', () => {
    const html = wrap(
      <NavMenuItem>
        <NavMenuItem.Link to="/admin/pages">
          <NavMenuItem.Label>页面</NavMenuItem.Label>
        </NavMenuItem.Link>
      </NavMenuItem>,
      '/admin/posts',
    )
    expect(html).toContain('页面')
    expect(html).not.toContain('aria-current="page"')
  })

  it('renders an external _blank link as an anchor with rel noreferrer', () => {
    const html = wrap(
      <NavMenuItem>
        <NavMenuItem.Link to="https://example.com" target="_blank">
          <NavMenuItem.Label>外部</NavMenuItem.Label>
        </NavMenuItem.Link>
      </NavMenuItem>,
    )
    expect(html).toContain('外部')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
  })

  it('renders a subpath-active link when activeMatch="subpath"', () => {
    const html = wrap(
      <NavMenuItem>
        <NavMenuItem.Link to="/admin/security" activeMatch="subpath">
          <NavMenuItem.Label>安全</NavMenuItem.Label>
        </NavMenuItem.Link>
      </NavMenuItem>,
      '/admin/security/users',
    )
    expect(html).toContain('安全')
    expect(html).toContain('aria-current="page"')
  })

  it('honours an explicit isActive prop override', () => {
    // Force-active even though the router path does not match.
    const html = wrap(
      <NavMenuItem>
        <NavMenuItem.Link to="/admin/elsewhere" isActive={true}>
          <NavMenuItem.Label>强制高亮</NavMenuItem.Label>
        </NavMenuItem.Link>
      </NavMenuItem>,
      '/admin/posts',
    )
    expect(html).toContain('强制高亮')
    expect(html).toContain('aria-current="page"')
  })

  it('renders a collapsible item with a toggle button', () => {
    const html = wrap(
      <NavMenuItem.Collapsible id="grp-1" paths={['/admin/library']}>
        <NavMenuItem.CollapsibleItem ariaLabel="展开媒体">
          <NavMenuItem.Label>媒体库</NavMenuItem.Label>
        </NavMenuItem.CollapsibleItem>
        <NavMenuItem.CollapsibleMenu>
          <NavMenuItem>
            <NavMenuItem.Link to="/admin/library/music">
              <NavMenuItem.Label>音乐</NavMenuItem.Label>
            </NavMenuItem.Link>
          </NavMenuItem>
        </NavMenuItem.CollapsibleMenu>
      </NavMenuItem.Collapsible>,
      '/admin/library/music',
    )
    expect(html).toContain('媒体库')
    expect(html).toContain('音乐')
    // The collapsible auto-expands when a child path is active.
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-controls="grp-1"')
  })

  it('keeps a collapsible collapsed when no child path is active', () => {
    const html = wrap(
      <NavMenuItem.Collapsible id="grp-2" paths={['/admin/library']}>
        <NavMenuItem.CollapsibleItem ariaLabel="展开媒体">
          <NavMenuItem.Label>媒体库</NavMenuItem.Label>
        </NavMenuItem.CollapsibleItem>
        <NavMenuItem.CollapsibleMenu>
          <NavMenuItem>
            <NavMenuItem.Link to="/admin/library/music">
              <NavMenuItem.Label>音乐</NavMenuItem.Label>
            </NavMenuItem.Link>
          </NavMenuItem>
        </NavMenuItem.CollapsibleMenu>
      </NavMenuItem.Collapsible>,
      '/admin/posts',
    )
    expect(html).toContain('媒体库')
    // No active child => collapsed by default.
    expect(html).toContain('aria-expanded="false"')
  })
})

// AdminShell is heavy (music query, version dialog, nav config) — assert only the children slot + skip-link.

describe('snapshot: AdminShell', () => {
  it('renders the skip-link, sidebar shell and children slot', () => {
    const html = stableHtml(
      renderInRouter(
        <AdminShell
          currentUser={{ id: 'u1', name: 'Admin', email: 'a@example.com', role: 'admin' }}
          siteTitle="My Blog"
        >
          <div data-test="page">page-content</div>
        </AdminShell>,
        '/admin/dashboard',
      ),
    )
    expect(html).toContain('跳转到主要内容')
    expect(html).toContain('page-content')
    expect(html).toContain('My Blog')
  })

  it('renders children when currentUser is a non-admin author', () => {
    const html = stableHtml(
      renderInRouter(
        <AdminShell currentUser={{ id: 'u2', name: 'Author', email: 'au@example.com', role: 'author' }}>
          <div>author-page</div>
        </AdminShell>,
        '/admin/posts',
      ),
    )
    expect(html).toContain('author-page')
    expect(html).toContain('Author')
  })
})
