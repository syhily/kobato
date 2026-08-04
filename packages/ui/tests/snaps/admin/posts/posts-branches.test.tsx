import type { AdminPostDto } from '@kobato/shared/contracts/posts'
import type { PostFilterFieldKey } from '@kobato/ui/admin/posts/filter-fields'
import type { ActiveFilter } from '@kobato/ui/admin/shared/filterPillsReducer'

import { makeAdminPost } from '#/_helpers/catalog'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'

import { PostsView } from '@kobato/ui/admin/posts/PostsView'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = mockTanstackQuery()

mocks.filters = [] as ActiveFilter<PostFilterFieldKey>[]

mocks.dispatch = vi.fn()

mocks.sources = {
  categories: [] as { id: string; name: string }[],
  tags: [] as string[],
  authors: [] as { id: string; name: string }[],
}

mocks.infinite = {
  data: undefined as { pages: { posts: AdminPostDto[]; total: number; hasMore: boolean }[] } | undefined,
  isLoading: true,
  error: null as Error | null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}

mocks.query = {
  data: null as unknown,
  isPending: false,
  isFetching: false,
  error: null,
  refetch: vi.fn(),
}

// PostsView drives its rows from `useInfiniteQuery` (server state lives in
// the TanStack cache) and its filter surface from the shared `useFilterPills`
// hook. To maximise render-path branch coverage we bypass both: a hoisted
// pill-list singleton each test can flip (the module mock swaps ONLY the
// hook — the real `<FilterPillBar>` still renders the pills), a hoisted
// slot for the infinite list query, and a shared slot for the three
// option-list queries.

vi.mock('@kobato/ui/admin/shared/filter-bar/useFilterPills', async () => {
  const { buildPostFilterFields } = await vi.importActual<typeof import('@kobato/ui/admin/posts/filter-fields')>(
    '@kobato/ui/admin/posts/filter-fields',
  )
  return {
    useFilterPills: () => ({
      filters: mocks.filters,
      hasFilters: mocks.filters.length > 0,
      dispatch: mocks.dispatch,
      queryInput: () => ({}),
      text: () => ({ op: 'contains', value: '' }),
      dateSingle: () => null,
      dateRange: () => null,
      bar: {
        fields: buildPostFilterFields(mocks.sources),
        filters: mocks.filters,
        search: {},
        onAddFilter: vi.fn(),
        onRemoveFilter: vi.fn(),
        onClearFilters: vi.fn(),
      },
    }),
  }
})

// ───────────────────────────── fixtures ─────────────────────────────

function makePost(overrides: Partial<AdminPostDto> = {}): AdminPostDto {
  return makeAdminPost({
    title: '示例文章',
    category: 'tech',
    tags: ['react'],
    ...overrides,
  })
}

function setList(posts: AdminPostDto[], total = posts.length): void {
  mocks.infinite.data = { pages: [{ posts, total, hasMore: false }] }
  mocks.infinite.isLoading = false
  mocks.infinite.error = null
}

function resetQueries(): void {
  mocks.infinite.data = undefined
  mocks.infinite.isLoading = true
  mocks.infinite.error = null
  mocks.infinite.hasNextPage = false
  mocks.infinite.isFetchingNextPage = false
  mocks.query.data = null
  mocks.query.isPending = false
  mocks.query.isFetching = false
}

// ─────────────────────────── shared setup ───────────────────────────

describe('snapshot: PostsView branches', () => {
  beforeEach(() => {
    mocks.filters = []
    mocks.dispatch = vi.fn()
    mocks.sources = { categories: [], tags: [], authors: [] }
    resetQueries()
  })

  // ─────────────────── loading / empty / populated ───────────────────

  it('renders the skeleton when the list query is pending and there are no rows', () => {
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('文章管理')
    expect(html).toContain('新建文章')
    // PostsSkeleton paints animate-pulse placeholders.
    expect(html).toContain('animate-pulse')
  })

  it('renders the empty-state branch once the list resolves without rows', () => {
    setList([])
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('未找到文章')
    // The create affordance remains visible.
    expect(html).toContain('新建文章')
  })

  it('renders populated rows via the map callback and the end-of-list sentinel', () => {
    const a = makePost({ id: '1000001', title: ' populated-row-title ' })
    const b = makePost({ id: '1000002', title: '另一篇文章' })
    setList([a, b], 2)
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('已加载全部文章')
    // PostRow renders the title.
    expect(html).toContain('另一篇文章')
  })

  // ────────────────────────────── error ──────────────────────────────

  it('still renders the chrome when the list query errors (toast path)', () => {
    mocks.infinite.isLoading = false
    mocks.infinite.error = new Error('boom')
    mocks.infinite.data = undefined
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    // Header + empty body still render; the toast is mocked.
    expect(html).toContain('文章管理')
    // With no rows and not loading, the empty-state renders.
    expect(html).toContain('未找到文章')
  })

  // ─────────────────── filter-bar placement + sort ───────────────────

  it('renders the bare 筛选 trigger and the sort select when no filters are active', () => {
    setList([])
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('筛选')
    expect(html).not.toContain('添加筛选')
    // The sort select stays in the header — it is not a filter pill.
    expect(html).toContain('最新发布')
  })

  // ─────────────────── active-filter pills ───────────────────
  //
  // Each active pill renders the field label on the left and the option
  // label in the value editor; the bar gains 添加筛选 / 清除.

  it.each([
    ['published', '已发布'],
    ['draft', '草稿'],
    ['unlisted', '不列出'],
    ['deleted', '已删除'],
  ] as const)('renders the status pill labelled %s for the %s value', (value, label) => {
    setList([])
    mocks.filters = [{ field: 'status', value, label }]
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('状态')
    expect(html).toContain(label)
    expect(html).toContain('添加筛选')
    expect(html).toContain('清除')
  })

  it('renders the category pill with the resolved option label', () => {
    setList([])
    mocks.sources.categories = [{ id: 'c-1', name: '前端' }]
    mocks.filters = [{ field: 'category', value: 'c-1', label: '前端' }]
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('分类')
    expect(html).toContain('前端')
  })

  it('renders the tag pill', () => {
    setList([])
    mocks.sources.tags = ['react']
    mocks.filters = [{ field: 'tag', value: 'react', label: 'react' }]
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('标签')
    expect(html).toContain('react')
  })

  it('renders the author pill with the resolved option label', () => {
    setList([])
    mocks.sources.authors = [{ id: 'u-1', name: '雨帆' }]
    mocks.filters = [{ field: 'author', value: 'u-1', label: '雨帆' }]
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('作者')
    expect(html).toContain('雨帆')
  })
})
