import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminPageDto } from '@/shared/contracts/pages'
import type { AdminUserDto } from '@/shared/contracts/users'
import type { PageFilterFieldKey } from '@/ui/admin/pages/filter-fields'
import type { ActiveFilter } from '@/ui/admin/shared/filterPillsReducer'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { PagesView } from '@/ui/admin/pages/PagesView'

const queryMocks = mockTanstackQuery()

queryMocks.infinite = {
  data: undefined as { pages: { pages: AdminPageDto[]; total: number; hasMore: boolean }[] } | undefined,
  isLoading: true,
  error: null as Error | null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}

queryMocks.query = {
  data: null as unknown,
  isPending: false,
  error: null as unknown,
}

queryMocks.filters = [] as ActiveFilter<PageFilterFieldKey>[]

queryMocks.dispatch = vi.fn()

// PagesView's list/authors queries are hoisted singletons so each test
// swaps resolved data + loading flag; the pill hook mock (audit-branches
// pattern) swaps ONLY the hook so the real FilterPillBar renders.

vi.mock('@/ui/admin/shared/filter-bar/useFilterPills', async () => {
  const actual = await vi.importActual<typeof import('@/ui/admin/shared/filter-bar/useFilterPills')>(
    '@/ui/admin/shared/filter-bar/useFilterPills',
  )
  return {
    ...actual,
    useFilterPills: ({ fields }: { fields: unknown }) => ({
      filters: queryMocks.filters,
      hasFilters: queryMocks.filters.length > 0,
      dispatch: queryMocks.dispatch,
      queryInput: () => ({}),
      text: () => ({ op: 'contains', value: '' }),
      dateSingle: () => null,
      dateRange: () => null,
      bar: {
        fields,
        filters: queryMocks.filters,
        search: {},
        onAddFilter: vi.fn(),
        onRemoveFilter: vi.fn(),
        onClearFilters: vi.fn(),
      },
    }),
  }
})

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
    webmentionsEnabled: true,
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

describe('snapshot: PagesView', () => {
  beforeEach(() => {
    queryMocks.infinite = {
      data: undefined,
      isLoading: true,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    }
    queryMocks.query = { data: { users: [makeAdminUser()], total: 1 }, isPending: false, error: null }
    queryMocks.filters = []
    queryMocks.dispatch = vi.fn()
  })

  it('renders the header chrome (title, filter bar, new-page link) regardless of query state', () => {
    const html = renderView()
    // Title always renders; the total span stays 0 until the list resolves.
    expect(html).toContain('页面管理')
    expect(html).toContain('新建页面')
    expect(html).toContain('href="/editor/page/new"')
    // No active filters — just the pill-bar 筛选 trigger in the header slot.
    expect(html).toContain('筛选')
    expect(html).not.toContain('添加筛选')
  })

  it('renders the list skeleton while the initial query is pending', () => {
    const html = renderView()
    expect(html).toContain('页面管理')
    expect(html).toContain('skeleton')
    // Empty-state copy is NOT shown while loading.
    expect(html).not.toContain('未找到页面')
  })

  it('renders the empty state when the list resolves with zero rows', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      data: { pages: [{ pages: [], total: 0, hasMore: false }] },
    }
    const html = renderView()
    expect(html).toContain('页面管理')
    expect(html).toContain('未找到页面')
    expect(html).not.toContain('skeleton')
  })

  it('renders populated rows and the end-of-list sentinel', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      data: { pages: [{ pages: [makeAdminPage()], total: 1, hasMore: false }] },
    }
    const html = renderView()
    expect(html).toContain('关于')
    expect(html).toContain('已加载全部页面')
  })

  it('renders the author pill with the label resolved from the seeded author list', () => {
    // Author field options come from the seeded users query.
    queryMocks.query = { data: { users: [makeAdminUser({ name: '雨帆' })], total: 1 }, isPending: false, error: null }
    queryMocks.filters = [{ field: 'author', value: '1', label: '雨帆' }]
    const html = renderView()
    expect(html).toContain('作者')
    expect(html).toContain('雨帆')
    // Active filters bring the 添加筛选 / 清除 affordances.
    expect(html).toContain('添加筛选')
    expect(html).toContain('清除')
  })

  it('renders a status pill labelled for the draft value', () => {
    queryMocks.filters = [{ field: 'status', value: 'draft', label: '草稿' }]
    const html = renderView()
    expect(html).toContain('状态')
    expect(html).toContain('草稿')
  })
})
