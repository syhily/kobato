import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminFriendDto } from '@/shared/types/friends'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { FriendsView } from '@/ui/admin/friends/FriendsView'

// FriendsView derives its rows directly from `useInfiniteQuery` pages and
// inlines its `{ q, includeHidden }` filter state via `useState` (the old
// `useFriendsReducer` pass-through was deleted). The existing
// `friends-view.test.tsx` covers the loading and empty states; this spec
// adds populated rows (the `rows.map` callback), the error state, and the
// include-hidden toggle's unchecked render branch. The checked branch is
// event-driven (`onCheckedChange` flips inlined state), which SSR cannot
// drive, so it is intentionally not covered here.

const queryMocks = vi.hoisted(() => ({
  infinite: {
    data: { pages: [] as { friends: AdminFriendDto[]; total: number; hasMore: boolean }[] } as unknown,
    isLoading: true,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    error: null as Error | null,
    fetchNextPage: vi.fn(),
  },
  mutation: {
    mutate: vi.fn(),
    isPending: false,
  },
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useInfiniteQuery: () => queryMocks.infinite,
    useMutation: () => queryMocks.mutation,
    useQueryClient: () => queryMocks.queryClient,
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock('@/ui/admin/shared/useDebouncedSearch', () => ({
  useDebouncedSearch: () => [debouncedSearch.value, debouncedSearch.setInput],
}))

const debouncedSearch = vi.hoisted(() => ({
  value: '',
  setInput: vi.fn(),
}))

vi.mock('@/ui/components/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-slot="dialog">{children}</div> : null,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-slot="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p data-slot="dialog-description">{children}</p>,
  DialogFooter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-slot="dialog-footer" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-slot="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-slot="dialog-title">{children}</h2>,
}))

// ───────────────────────────── fixtures ─────────────────────────────

function makeFriend(overrides: Partial<AdminFriendDto> = {}): AdminFriendDto {
  return {
    id: 'friend-1',
    website: '示例博客',
    description: '一个示例博客',
    homepage: 'https://example.com',
    poster: '/images/friends/example.jpg',
    rssUrl: null,
    visible: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function setRows(friends: AdminFriendDto[], total = friends.length, hasMore = false): void {
  queryMocks.infinite = {
    ...queryMocks.infinite,
    isLoading: false,
    error: null,
    data: { pages: [{ friends, total, hasMore }] },
  }
}

// ─────────────────────────── shared setup ───────────────────────────

describe('snapshot: FriendsView branches', () => {
  beforeEach(() => {
    queryMocks.infinite = {
      data: { pages: [] },
      isLoading: true,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      error: null,
      fetchNextPage: vi.fn(),
    }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
    queryMocks.queryClient = { invalidateQueries: vi.fn() }
    debouncedSearch.value = ''
    debouncedSearch.setInput = vi.fn()
  })

  it('renders populated rows via the rows.map callback', () => {
    const a = makeFriend({ id: 'friend-1', website: '示例博客', homepage: 'https://a.example.com' })
    const b = makeFriend({ id: 'friend-2', website: '老朋友', homepage: 'https://b.example.com' })
    setRows([a, b], 2)
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).toContain('示例博客')
    expect(html).toContain('老朋友')
    // FriendRow renders the homepage URL (safeHref renders as an href).
    expect(html).toContain('https://a.example.com')
    expect(html).toContain('https://b.example.com')
    // Edit / delete affordances carry the website name in their aria-labels.
    expect(html).toContain('编辑友链 示例博客')
    expect(html).toContain('删除友链 老朋友')
    // Header title reflects the resolved total.
    expect(html).toContain('友链管理')
    // End-of-list sentinel copy.
    expect(html).toContain('已加载全部友链')
  })

  it('renders the empty-state branch once the fetch resolves without rows', () => {
    setRows([])
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).toContain('未找到友链')
  })

  it('still renders the chrome when the infinite query errors (toast path)', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      error: new Error('unreachable'),
      data: { pages: [] },
    }
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).toContain('友链管理')
    expect(html).toContain('未找到友链')
  })

  // ───────────── include-hidden toggle (unchecked default) ─────────────

  it('renders the include-hidden checkbox unchecked by default', () => {
    setRows([])
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).toContain('friends-include-hidden')
    expect(html).toContain('包含已隐藏')
    // Base UI marks an unchecked checkbox with aria-checked="false" and
    // omits the checkmark indicator svg entirely.
    expect(html).toContain('aria-checked="false"')
    expect(html).not.toContain('aria-checked="true"')
  })

  it('reflects the active search term in the search input value', () => {
    debouncedSearch.value = '关键词'
    setRows([])
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).toContain('value="关键词"')
    expect(html).toContain('搜索友链')
  })
})
