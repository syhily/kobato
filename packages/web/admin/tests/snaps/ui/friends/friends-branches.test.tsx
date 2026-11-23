import type { AdminFriendDto } from '@kobato/api/contracts/admin/friends'

import { mockTanstackQuery } from '@kobato/test/mock-react-query'
import { FriendsView } from '@kobato/web-admin/ui/friends/FriendsView'
import { renderInRouter, stableHtml } from '@kobato/web-client/tests/utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.infinite = {
  data: { pages: [] as { friends: AdminFriendDto[]; total: number; hasMore: boolean }[] } as unknown,
  isLoading: true,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  error: null as Error | null,
  fetchNextPage: vi.fn(),
}

queryMocks.mutation = {
  mutate: vi.fn(),
  isPending: false,
}

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
}

vi.mock('@kobato/ui/lib/use-debounced-search', () => ({
  useDebouncedSearch: () => [debouncedSearch.value, debouncedSearch.setInput],
}))

vi.mock('@kobato/ui/components/dialog', () => import('@kobato/web-admin/tests/utils/dialog'))

const debouncedSearch = vi.hoisted(() => ({
  value: '',
  setInput: vi.fn(),
}))

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
    expect(html).toContain('https://a.example.com')
    expect(html).toContain('https://b.example.com')
    expect(html).toContain('编辑友链 示例博客')
    expect(html).toContain('删除友链 老朋友')
    expect(html).toContain('友链管理')
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

  it('renders the include-hidden checkbox unchecked by default', () => {
    setRows([])
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).toContain('friends-include-hidden')
    expect(html).toContain('包含已隐藏')
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
