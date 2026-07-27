import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminPostDto } from '@/shared/contracts/posts'
import type { PostFilterFieldKey } from '@/ui/admin/posts/filter-fields'
import type { ActiveFilter } from '@/ui/admin/shared/filterPillsReducer'

import { makeAdminPost } from '#/_helpers/catalog'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { PostsView } from '@/ui/admin/posts/PostsView'

// PostsView drives its rows from `useInfiniteQuery` (server state lives in
// the TanStack cache) and its filter surface from the shared `useFilterPills`
// hook. To maximise render-path branch coverage we bypass both: a hoisted
// pill-list singleton each test can flip (the module mock swaps ONLY the
// hook — the real `<FilterPillBar>` still renders the pills), a hoisted
// slot for the infinite list query, and a shared slot for the three
// option-list queries.

const mocks = vi.hoisted(() => ({
  filters: [] as ActiveFilter<PostFilterFieldKey>[],
  dispatch: vi.fn(),
  sources: {
    categories: [] as { id: string; name: string }[],
    tags: [] as string[],
    authors: [] as { id: string; name: string }[],
  },
  list: {
    data: undefined as { pages: { posts: AdminPostDto[]; total: number; hasMore: boolean }[] } | undefined,
    isLoading: true,
    error: null as Error | null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  },
  aux: {
    data: null as unknown,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  },
}))

vi.mock('@/ui/admin/shared/filter-bar/useFilterPills', async () => {
  const { buildPostFilterFields } = await vi.importActual<typeof import('@/ui/admin/posts/filter-fields')>(
    '@/ui/admin/posts/filter-fields',
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

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => mocks.aux,
    useQueries: ({ queries }: { queries: unknown[] }) => queries.map(() => mocks.aux),
    useInfiniteQuery: () => mocks.list,
    useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn(), removeQueries: vi.fn() }),
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

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
  mocks.list.data = { pages: [{ posts, total, hasMore: false }] }
  mocks.list.isLoading = false
  mocks.list.error = null
}

function resetQueries(): void {
  mocks.list.data = undefined
  mocks.list.isLoading = true
  mocks.list.error = null
  mocks.list.hasNextPage = false
  mocks.list.isFetchingNextPage = false
  mocks.aux.data = null
  mocks.aux.isPending = false
  mocks.aux.isFetching = false
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
    mocks.list.isLoading = false
    mocks.list.error = new Error('boom')
    mocks.list.data = undefined
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
    ['hidden', '隐藏'],
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
