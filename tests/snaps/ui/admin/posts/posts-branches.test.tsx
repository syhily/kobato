import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminPostDto } from '@/shared/types/posts'
import type { PostStatusFilter, PostsFilters } from '@/ui/admin/posts/usePostsFilters'

import { makeAdminPost } from '#/_helpers/catalog'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { PostsView } from '@/ui/admin/posts/PostsView'

// PostsView drives its rows from `useInfiniteQuery` (server state lives in
// the TanStack cache) and its filters from `usePostsFilters`. To maximise
// render-path branch coverage we bypass both: a hoisted filters singleton
// each test can flip, and two hoisted query slots — the infinite list
// query and the shared slot for the three option-list queries.

const controller = vi.hoisted(() => ({
  filters: {
    status: 'all' as PostStatusFilter,
    category: '',
    tag: '',
    authorId: '',
    sortBy: 'publishedAt' as PostsFilters['sortBy'],
    sortOrder: 'desc' as PostsFilters['sortOrder'],
  } satisfies PostsFilters,
}))

vi.mock('@/ui/admin/posts/usePostsFilters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ui/admin/posts/usePostsFilters')>()
  return {
    ...actual,
    usePostsFilters: () => ({
      filters: controller.filters,
      setStatus: vi.fn(),
      setCategory: vi.fn(),
      setTag: vi.fn(),
      setAuthorId: vi.fn(),
      setSortBy: vi.fn(),
      setSortOrder: vi.fn(),
    }),
  }
})

const listQuery = vi.hoisted(() => ({
  data: undefined as { pages: { posts: AdminPostDto[]; total: number; hasMore: boolean }[] } | undefined,
  isLoading: true,
  error: null as Error | null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}))

// The three auxiliary option-list queries share a single slot because
// PostsView treats them identically (they only differ by `data` shape).
const auxQuery = vi.hoisted(() => ({
  data: null as unknown,
  isPending: false,
  isFetching: false,
  error: null,
  refetch: vi.fn(),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useInfiniteQuery: () => listQuery,
    useQuery: () => auxQuery,
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

function setFilters(overrides: Partial<PostsFilters> = {}): void {
  controller.filters = { ...controller.filters, ...overrides }
}

function setList(posts: AdminPostDto[], total = posts.length): void {
  listQuery.data = { pages: [{ posts, total, hasMore: false }] }
  listQuery.isLoading = false
  listQuery.error = null
}

function resetQueries(): void {
  listQuery.data = undefined
  listQuery.isLoading = true
  listQuery.error = null
  listQuery.hasNextPage = false
  listQuery.isFetchingNextPage = false
  auxQuery.data = null
  auxQuery.isPending = false
  auxQuery.isFetching = false
}

// ─────────────────────────── shared setup ───────────────────────────

describe('snapshot: PostsView branches', () => {
  beforeEach(() => {
    controller.filters = {
      status: 'all',
      category: '',
      tag: '',
      authorId: '',
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    }
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
    listQuery.isLoading = false
    listQuery.error = new Error('boom')
    listQuery.data = undefined
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    // Header + empty body still render; the toast is mocked.
    expect(html).toContain('文章管理')
    // With no rows and not loading, the empty-state renders.
    expect(html).toContain('未找到文章')
  })

  // ─────────────────── each status-filter value ───────────────────

  it.each(['all', 'published', 'draft', 'hidden', 'deleted'] satisfies PostStatusFilter[])(
    'renders the status-filter trigger labelled for the %s status',
    (status) => {
      const labels: Record<PostStatusFilter, string> = {
        all: '全部状态',
        published: '已发布',
        draft: '草稿',
        hidden: '隐藏',
        deleted: '已删除',
      }
      setList([])
      setFilters({ status })
      const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
      expect(html).toContain(labels[status])
    },
  )

  // ──────────────────── each sort option label ─────────────────────

  it.each([
    ['publishedAt', 'desc', '最新发布'],
    ['publishedAt', 'asc', '最早发布'],
    ['updatedAt', 'desc', '最近更新'],
    ['updatedAt', 'asc', '最早更新'],
  ] as const)('renders the sort trigger labelled %s for %s-%s', (sortBy, sortOrder, label) => {
    setList([])
    setFilters({ sortBy, sortOrder })
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain(label)
  })

  // ─────────── secondary option-list queries (memos + maps) ─────────
  //
  // The category / tag / author option-list `useMemo` callbacks run on
  // every render regardless of whether the popup is open, which is the
  // render-path branch we care about here. Base UI portals the popup
  // content away during SSR (it only mounts on client open), so the
  // individual option labels are not part of the SSR string — we
  // therefore assert the memos ran by checking the trigger's resolved
  // value (the placeholder / selected label) and that the render did
  // not throw.

  it('runs the categoryOptions memo from the categories query without crashing', () => {
    auxQuery.data = { categories: [{ name: '前端' }, { name: '随笔' }], total: 2 }
    setList([])
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    // The placeholder label is the first entry of the memo.
    expect(html).toContain('全部分类')
    expect(html).toContain('文章管理')
  })

  it('runs the tagNames memo from the tags query without crashing', () => {
    auxQuery.data = { tags: [{ name: 'react' }, { name: 'vite' }], total: 2 }
    setList([])
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    // Combobox trigger renders its placeholder when no value is set.
    expect(html).toContain('全部标签')
    expect(html).toContain('文章管理')
  })

  it('runs the authorOptions memo from the users query without crashing', () => {
    auxQuery.data = {
      users: [
        { id: 'u-1', name: '雨帆' },
        { id: 'u-2', name: '访客' },
      ],
    }
    setList([])
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('全部作者')
    expect(html).toContain('文章管理')
  })

  // ─────────────── active-filter states (clear buttons) ─────────────
  //
  // When a filter value is set the pill swaps to the value label and
  // mounts an inline clear (X) button. The label IS user-visible in
  // the closed trigger; the X button is rendered inline (no portal).

  it('renders the category-filter active state with the value as the trigger label', () => {
    setList([])
    setFilters({ category: 'tech' })
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('tech')
  })

  it('renders the tag-filter active state', () => {
    setList([])
    setFilters({ tag: 'react' })
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('react')
  })

  it('renders the author-filter active state', () => {
    auxQuery.data = { users: [{ id: 'u-1', name: '雨帆' }] }
    setList([])
    setFilters({ authorId: 'u-1' })
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('雨帆')
  })
})
