import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminPageDto } from '@/shared/types/pages'
import type { AdminUserDto } from '@/shared/types/users'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { PagesView } from '@/ui/admin/pages/PagesView'

// `PagesView` issues two `useQuery` calls (`admin.pages.list` + `admin.users.
// list`) and an imperative `orpc.admin.pages.list` for the infinite-scroll
// sentinel. We hoist query singletons so each test can swap the resolved
// list / users data + loading flag without re-mocking, mirroring the
// musics-view pattern. `orpc` itself is stubbed inert for the loadMore path.
//
// The component's `state.rows` / `state.total` are populated from the query
// result via a `useEffect` — effects don't run during SSR (`renderToString`),
// so on a single render the rows array is always empty. We therefore assert
// on the loading branch (skeleton), the empty branch (未找到页面), and the
// header chrome (title, new-page link, status / author filter triggers) that
// render unconditionally. The populated-rows branch lives behind the effect
// and is covered by integration tests instead.
const queryMocks = vi.hoisted(() => ({
  list: {
    data: null as unknown,
    isPending: true,
    error: null as unknown,
  },
  users: {
    data: null as unknown,
    isPending: false,
    error: null as unknown,
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    // The first useQuery call resolves `list`; the second resolves `users`.
    // Track call order via a closure counter so both queries see the right
    // fixture on each synchronous SSR render.
    useQuery: (() => {
      let callIndex = 0
      return () => {
        callIndex += 1
        return callIndex % 2 === 1 ? queryMocks.list : queryMocks.users
      }
    })(),
  }
})

vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: {
    admin: {
      pages: {
        list: {
          queryOptions: (args: unknown) => ({ queryKey: ['pages', 'list', args], queryFn: async () => ({}) }),
        },
      },
      users: {
        list: {
          queryOptions: (args: unknown) => ({ queryKey: ['users', 'list', args], queryFn: async () => ({}) }),
        },
      },
    },
  },
}))

vi.mock('@/client/api/client', () => ({
  orpc: {
    admin: {
      pages: { list: vi.fn(async () => ({ pages: [], total: 0, hasMore: false })) },
    },
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// ───────────────────────────── fixtures ─────────────────────────────

function makeAdminPage(overrides: Partial<AdminPageDto> = {}): AdminPageDto {
  return {
    id: '1000001',
    slug: 'about',
    title: '关于',
    summary: '关于本站。',
    cover: '/images/pages/about.jpg',
    og: null,
    published: true,
    commentsEnabled: false,
    showToc: false,
    showUpdated: false,
    showFriends: false,
    publishedAt: '2024-01-01T00:00:00.000Z',
    publishedRevisionId: 'rev-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    deletedAt: null,
    authorId: '1',
    authorName: '雨帆',
    commentCount: 0,
    commentPublicId: '',
    ...overrides,
  }
}

function makeAdminUser(overrides: Partial<AdminUserDto> = {}): AdminUserDto {
  return {
    id: '1',
    name: '雨帆',
    email: 'syhily@gmail.com',
    role: 'admin',
    website: 'https://example.com',
    avatar: '/images/avatar/1.png',
    bio: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastSignedInAt: null,
    postCount: 0,
    pageCount: 0,
    ...overrides,
  } as AdminUserDto
}

function renderView() {
  return stableHtml(renderInRouter(<PagesView />, '/admin/pages'))
}

// ───────────────────────────── PagesView ────────────────────────────

describe('snapshot: PagesView', () => {
  beforeEach(() => {
    queryMocks.list = { data: null, isPending: true, error: null }
    queryMocks.users = { data: { users: [makeAdminUser()], total: 1 }, isPending: false, error: null }
  })

  it('renders the header chrome (title, filters, new-page link) regardless of query state', () => {
    const html = renderView()
    // Header title always renders; the total span is 0 until the loaded
    // effect runs (effects don't fire on SSR), but the title text is static.
    expect(html).toContain('页面管理')
    // New-page anchor — present in every render branch.
    expect(html).toContain('新建页面')
    expect(html).toContain('href="/editor/page/new"')
    // Status filter trigger shows the initial "全部状态" value.
    expect(html).toContain('全部状态')
    // Author filter trigger shows the initial "全部作者" value.
    expect(html).toContain('全部作者')
  })

  it('renders the list skeleton while the initial query is pending', () => {
    // list isPending=true and state.rows is empty (initial reducer state) →
    // isLoading=true → the PagesSkeleton branch mounts.
    queryMocks.list = { data: null, isPending: true, error: null }
    const html = renderView()
    expect(html).toContain('页面管理')
    expect(html).toContain('skeleton')
    // Empty-state copy is NOT shown while loading.
    expect(html).not.toContain('未找到页面')
  })

  it('renders the empty state when the list resolves with zero rows', () => {
    // list resolves successfully but the loaded effect hasn't populated
    // state.rows on SSR (effects don't run). state.rows.length === 0 →
    // the Empty branch mounts. isLoading is false because isPending=false.
    queryMocks.list = {
      data: { pages: [makeAdminPage()], total: 1, hasMore: false },
      isPending: false,
      error: null,
    }
    const html = renderView()
    expect(html).toContain('页面管理')
    // The Empty branch renders the search-icon empty state.
    expect(html).toContain('未找到页面')
    // The skeleton branch is gone once isPending flips false.
    expect(html).not.toContain('skeleton')
  })

  it('renders the author filter trigger with the seeded author list available', () => {
    // The users query resolves with one admin user; the author Select
    // options are built from it. The Base UI SelectContent is portalled
    // and only mounts its items when open, so on SSR we assert on the
    // trigger's "全部作者" default-value label only.
    queryMocks.users = { data: { users: [makeAdminUser({ name: '雨帆' })], total: 1 }, isPending: false, error: null }
    const html = renderView()
    expect(html).toContain('全部作者')
  })
})
