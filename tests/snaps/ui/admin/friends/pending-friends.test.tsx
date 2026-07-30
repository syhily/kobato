import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminFriendDto } from '@/shared/contracts/friends'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { FriendsView } from '@/ui/admin/friends/FriendsView'

const queryMocks = mockTanstackQuery()

queryMocks.infinite = {
  data: { pages: [{ friends: [] as AdminFriendDto[], total: 0, hasMore: false }] } as unknown,
  isLoading: false,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  error: null,
  fetchNextPage: vi.fn(),
}

queryMocks.query = {
  data: undefined as { friends: AdminFriendDto[] } | undefined,
  isLoading: false,
  error: null as Error | null,
}

queryMocks.mutation = {
  mutate: vi.fn(),
  isPending: false,
}

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
}

// Covers the pending-review bucket on top of the admin friends list:
// `useQuery` (pending rows) is mocked separately from the main list's
// `useInfiniteQuery` (empty here), so the bucket renders alone.

vi.mock('@/ui/components/dialog', () => import('#/_helpers/stubs/dialog'))

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
    queryMocks.query = { data: undefined, isLoading: false, error: null }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  })

  it('stays hidden while the pending query has no rows', () => {
    queryMocks.query = { ...queryMocks.query, data: { friends: [] } }
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).not.toContain('待审核申请')
  })

  it('renders pending rows with approve/edit/delete affordances', () => {
    queryMocks.query = {
      ...queryMocks.query,
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
    queryMocks.query = { ...queryMocks.query, data: { friends: [makePendingFriend()] } }
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).toContain('待审核申请')
    expect(html).toContain('无封面')
    expect(html).toContain('缺少封面图，请先编辑补充')
    expect(html).toContain('通过友链 申请者')
  })
})
