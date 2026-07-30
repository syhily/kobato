import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { AdminFriendDto } from '@/shared/contracts/friends'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderToHtml, stableHtml } from '#/_helpers/render'
import { EditFriendDialog } from '@/ui/admin/friends/EditFriendDialog'
import { FriendRow, FriendsSkeleton } from '@/ui/admin/friends/FriendRow'
import { FriendsView } from '@/ui/admin/friends/FriendsView'

const queryMocks = mockTanstackQuery()

queryMocks.query = {
  data: null as unknown,
  isPending: false,
  isFetching: false,
  error: null,
  refetch: vi.fn(),
}

queryMocks.mutation = {
  mutate: vi.fn(),
  isPending: false,
}

queryMocks.infinite = {
  data: { pages: [] as unknown[] },
  isLoading: false,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  error: null,
  fetchNextPage: vi.fn(),
}

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
}

vi.mock('@/ui/components/dialog', () => import('#/_helpers/stubs/dialog'))

function makeAdminFriend(overrides: Partial<AdminFriendDto> = {}): AdminFriendDto {
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

describe('snapshot: FriendsView', () => {
  it('renders the loading skeleton while fetching', () => {
    queryMocks.infinite = { ...queryMocks.infinite, isLoading: true, data: { pages: [] } }
    const html = stableHtml(renderToHtml(<FriendsView />))
    expect(html).toContain('友链管理')
    expect(html).toContain('skeleton')
  })

  it('renders the empty state when no friends exist', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      data: { pages: [{ friends: [], total: 0, hasMore: false }] },
    }
    const html = stableHtml(renderToHtml(<FriendsView />))
    expect(html).toContain('友链管理')
    expect(html).toContain('未找到友链')
    expect(html).toContain('新增友链')
  })

  it('renders a list of friends', () => {
    const friend = makeAdminFriend({ website: '友链一号', homepage: 'https://friend1.example.com' })
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      data: { pages: [{ friends: [friend], total: 1, hasMore: false }] },
    }
    const html = stableHtml(renderToHtml(<FriendsView />))
    expect(html).toContain('友链一号')
    expect(html).toContain('https://friend1.example.com')
    expect(html).toContain('已加载全部友链')
  })
})

describe('snapshot: FriendRow', () => {
  it('renders a visible friend with homepage link and description', () => {
    const friend = makeAdminFriend({
      website: 'Alice 的博客',
      homepage: 'https://alice.example.com',
      description: 'Alice 写代码的地方',
      poster: '/images/friends/alice.jpg',
      visible: true,
    })
    const html = stableHtml(
      renderToHtml(<FriendRow friend={friend} disabled={false} onEdit={() => {}} onDelete={() => {}} />),
    )
    expect(html).toContain('Alice 的博客')
    expect(html).toContain('https://alice.example.com')
    expect(html).toContain('Alice 写代码的地方')
    expect(html).toContain('/images/friends/alice.jpg')
    expect(html).toContain('显示')
  })

  it('renders a hidden friend without a safe homepage link', () => {
    const friend = makeAdminFriend({
      website: 'Bob 的博客',
      homepage: 'not-a-url',
      description: null,
      visible: false,
    })
    const html = stableHtml(
      renderToHtml(<FriendRow friend={friend} disabled={true} onEdit={() => {}} onDelete={() => {}} />),
    )
    expect(html).toContain('Bob 的博客')
    expect(html).toContain('not-a-url')
    expect(html).toContain('隐藏')
    expect(html).toContain('disabled=""')
  })
})

describe('snapshot: FriendsSkeleton', () => {
  it('renders placeholder rows', () => {
    const html = stableHtml(renderToHtml(<FriendsSkeleton />))
    expect(html).toContain('skeleton')
  })
})

describe('snapshot: EditFriendDialog', () => {
  it('renders nothing when closed', () => {
    const html = stableHtml(renderToHtml(<EditFriendDialog friend={undefined} onClose={() => {}} onSaved={() => {}} />))
    expect(html).toBe('')
  })

  it('renders the new-friend form when opened for creation', () => {
    function Wrapper() {
      const [target, setTarget] = useState<null | undefined>(undefined)
      if (target === undefined) {
        setTarget(null)
      }
      return <EditFriendDialog friend={target} onClose={() => {}} onSaved={() => {}} />
    }
    const html = stableHtml(renderToHtml(<Wrapper />))
    expect(html).toContain('新增友链')
    expect(html).toContain('friend-website')
    expect(html).toContain('friend-homepage')
    expect(html).toContain('friend-poster')
    expect(html).toContain('friend-visible')
    expect(html).toContain('创建')
  })

  it('renders the edit form for an existing friend', () => {
    const friend = makeAdminFriend({ website: '老朋友的博客' })
    function Wrapper() {
      const [target, setTarget] = useState<AdminFriendDto | undefined>(undefined)
      if (target === undefined) {
        setTarget(friend)
      }
      return <EditFriendDialog friend={target} onClose={() => {}} onSaved={() => {}} />
    }
    const html = stableHtml(renderToHtml(<Wrapper />))
    expect(html).toContain('编辑友链')
    expect(html).toContain('friend-website')
    expect(html).toContain('friend-poster')
    expect(html).toContain('保存')
  })
})
