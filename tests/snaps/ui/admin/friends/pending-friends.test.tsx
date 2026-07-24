import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminFriendDto } from '@/shared/contracts/friends'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { FriendsView } from '@/ui/admin/friends/FriendsView'

// Covers the pending-review bucket on top of the admin friends list:
// `useQuery` (pending rows) is mocked separately from the main list's
// `useInfiniteQuery` (empty here), so the bucket renders alone.

const queryMocks = vi.hoisted(() => ({
  infinite: {
    data: { pages: [{ friends: [] as AdminFriendDto[], total: 0, hasMore: false }] } as unknown,
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    error: null,
    fetchNextPage: vi.fn(),
  },
  pending: {
    data: undefined as { friends: AdminFriendDto[] } | undefined,
    isLoading: false,
    error: null as Error | null,
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
    useQuery: () => queryMocks.pending,
    useMutation: () => queryMocks.mutation,
    useQueryClient: () => queryMocks.queryClient,
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock('@/ui/admin/shared/useDebouncedSearch', () => ({
  useDebouncedSearch: () => ['', vi.fn()],
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

function makePendingFriend(overrides: Partial<AdminFriendDto> = {}): AdminFriendDto {
  return {
    id: 'pending-1',
    website: '申请者',
    description: null,
    homepage: 'https://applicant.example.com',
    poster: '',
    rssUrl: null,
    visible: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('snapshot: FriendsView pending bucket', () => {
  beforeEach(() => {
    queryMocks.infinite = {
      data: { pages: [{ friends: [], total: 0, hasMore: false }] },
      isLoading: false,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      error: null,
      fetchNextPage: vi.fn(),
    }
    queryMocks.pending = { data: undefined, isLoading: false, error: null }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  })

  it('stays hidden while the pending query has no rows', () => {
    queryMocks.pending = { ...queryMocks.pending, data: { friends: [] } }
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).not.toContain('待审核申请')
  })

  it('renders pending rows with approve/edit/delete affordances', () => {
    queryMocks.pending = {
      ...queryMocks.pending,
      data: { friends: [makePendingFriend({ poster: 'https://applicant.example.com/cover.jpg' })] },
    }
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).toContain('待审核申请')
    expect(html).toContain('申请者')
    expect(html).toContain('https://applicant.example.com')
    expect(html).toContain('通过友链 申请者')
    expect(html).toContain('删除友链 申请者')
  })

  it('keeps approve disabled until a poster is filled in', () => {
    queryMocks.pending = { ...queryMocks.pending, data: { friends: [makePendingFriend()] } }
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).toContain('待审核申请')
    expect(html).toContain('无封面')
    expect(html).toContain('缺少封面图，请先编辑补充')
    expect(html).toContain('通过友链 申请者')
  })
})
