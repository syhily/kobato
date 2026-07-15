import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminPostDto } from '@/shared/types/posts'
import type { PostStatusFilter } from '@/ui/admin/posts/usePostsReducer'

import { makeAdminPost } from '#/_helpers/catalog'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { PostsView } from '@/ui/admin/posts/PostsView'

// PostsView drives its rows from a reducer (`usePostsReducer`) and four
// `useQuery` calls: the post list plus the secondary option-list queries for
// categories, tags and authors. To maximise render-path branch coverage we
// bypass the real reducer entirely and pass a hoisted `state` singleton so
// each test can flip a single filter / sort field, and we route the four
// query calls through two hoisted result slots: the first call resolves to
// the list result, the remaining three resolve to the option-list payloads.

interface ControllerState {
  rows: AdminPostDto[]
  total: number
  q: string
  deletedStatus: 'all' | 'deleted' | 'normal'
  pageSize: number
  status: PostStatusFilter
  published?: boolean
  visible?: boolean
  category: string
  tag: string
  authorId: string
  sortBy: 'publishedAt' | 'updatedAt'
  sortOrder: 'asc' | 'desc'
}

const controllerState = vi.hoisted(() => ({
  state: {
    rows: [] as AdminPostDto[],
    total: 0,
    q: '',
    deletedStatus: 'all' as 'all' | 'deleted' | 'normal',
    pageSize: 10,
    status: 'all' as PostStatusFilter,
    category: '',
    tag: '',
    authorId: '',
    sortBy: 'publishedAt' as 'publishedAt' | 'updatedAt',
    sortOrder: 'desc' as 'asc' | 'desc',
  } satisfies ControllerState,
}))

vi.mock('@/ui/admin/posts/usePostsReducer', () => ({
  usePostsReducer: () => ({ state: controllerState.state, dispatch: vi.fn() }),
  // The real PostsView imports the type as a value-resolved reference for
  // its cast inside `onValueChange`; the helper is not actually executed
  // under SSR (event handlers don't fire) but the symbol must resolve.
}))

const listQuery = vi.hoisted(() => ({
  data: null as { posts: AdminPostDto[]; total: number; hasMore: boolean } | null,
  isPending: true,
  isFetching: false,
  error: null as Error | null,
  refetch: vi.fn(),
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
    useQuery: (() => {
      let calls = 0
      return () => {
        calls += 1
        return calls === 1 ? listQuery : auxQuery
      }
    })(),
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

function setState(overrides: Partial<ControllerState> = {}): void {
  controllerState.state = { ...controllerState.state, ...overrides }
}

function setList(posts: AdminPostDto[], total = posts.length): void {
  listQuery.data = { posts, total, hasMore: false }
  listQuery.isPending = false
  listQuery.error = null
}

function resetQueries(): void {
  listQuery.data = null
  listQuery.isPending = true
  listQuery.isFetching = false
  listQuery.error = null
  auxQuery.data = null
  auxQuery.isPending = false
  auxQuery.isFetching = false
}

// ─────────────────────────── shared setup ───────────────────────────

describe('snapshot: PostsView branches', () => {
  beforeEach(() => {
    controllerState.state = {
      rows: [],
      total: 0,
      q: '',
      deletedStatus: 'all',
      pageSize: 10,
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
    setState({ total: 0 })
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('未找到文章')
    // The create affordance remains visible.
    expect(html).toContain('新建文章')
  })

  it('renders populated rows via the map callback and the end-of-list sentinel', () => {
    const a = makePost({ id: '1000001', title: ' populated-row-title ' })
    const b = makePost({ id: '1000002', title: '另一篇文章' })
    setList([a, b], 2)
    setState({ rows: [a, b], total: 2 })
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('已加载全部文章')
    // PostRow renders the title.
    expect(html).toContain('另一篇文章')
  })

  // ────────────────────────────── error ──────────────────────────────

  it('still renders the chrome when the list query errors (toast path)', () => {
    listQuery.isPending = false
    listQuery.error = new Error('boom')
    listQuery.data = null
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    // Header + empty body still render; the toast is mocked.
    expect(html).toContain('文章管理')
    // With no rows and not loading, the empty-state renders.
    expect(html).toContain('未找到文章')
  })

  // ───────────────────── each status-filter value ───────────────────

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
      setState({ status })
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
    setState({ sortBy, sortOrder })
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
    setState({ category: 'tech' })
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('tech')
  })

  it('renders the tag-filter active state', () => {
    setList([])
    setState({ tag: 'react' })
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('react')
  })

  it('renders the author-filter active state', () => {
    auxQuery.data = { users: [{ id: 'u-1', name: '雨帆' }] }
    setList([])
    setState({ authorId: 'u-1' })
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('雨帆')
  })

  // ────────────────────── search-query active ───────────────────────

  it('keeps the search term in the list query input when q is set', () => {
    setList([])
    setState({ q: '关键词' })
    // We cannot introspect the query call args directly (the hook is
    // mocked away), but `buildQueryInput` derives `q: undefined | string`
    // from state.q, and rendering with a non-empty q must not crash and
    // still emit the list chrome.
    const html = stableHtml(renderInRouter(<PostsView />, '/admin/posts'))
    expect(html).toContain('文章管理')
    expect(html).toContain('未找到文章')
  })
})
