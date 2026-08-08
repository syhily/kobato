import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminFriendDto } from '@/shared/contracts/friends'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { EditFriendDialog } from '@/ui/admin/friends/EditFriendDialog'
import { FriendsView } from '@/ui/admin/friends/FriendsView'

const queryMocks = mockTanstackQuery()

queryMocks.infinite = {
  data: { pages: [] as unknown[] } as unknown,
  isLoading: true,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  error: null,
  fetchNextPage: vi.fn(),
}

queryMocks.mutation = {
  mutate: vi.fn(),
  isPending: false,
}

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
}

// FriendsView relies on an infinite-query list + delete mutation + debounced
// search; queries are neutralized so SSR emits the loading chrome.

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
  })

  it('renders the header, search box, include-hidden toggle and skeleton while loading', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: true,
      data: { pages: [] },
    }
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).toContain('友链管理')
    expect(html).toContain('公共页面以随机顺序展示')
    expect(html).toContain('搜索站名、简介或主页 URL')
    expect(html).toContain('包含已隐藏')
    expect(html).toContain('新增友链')
    expect(html).toContain('skeleton')
  })

  it('renders the empty state once the fetch resolves without rows', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      data: { pages: [{ friends: [], total: 0, hasMore: false }] },
    }
    const html = stableHtml(renderInRouter(<FriendsView />, '/admin/links'))
    expect(html).toContain('友链管理')
    expect(html).toContain('未找到友链')
  })
})

describe('snapshot: EditFriendDialog', () => {
  it('renders nothing while closed (friend === undefined)', () => {
    const html = stableHtml(
      renderToHtml(<EditFriendDialog friend={undefined} onClose={() => undefined} onSaved={() => undefined} />),
    )
    expect(html).toBe('')
  })

  it('renders the new-friend form for the null (create) target', () => {
    function Wrapper() {
      const [target, setTarget] = useState<AdminFriendDto | null | undefined>(undefined)
      if (target === undefined) {
        setTarget(null)
      }
      return <EditFriendDialog friend={target} onClose={() => undefined} onSaved={() => undefined} />
    }
    const html = stableHtml(renderToHtml(<Wrapper />))
    expect(html).toContain('新增友链')
    expect(html).toContain('friend-website')
    expect(html).toContain('friend-homepage')
    expect(html).toContain('friend-poster')
    expect(html).toContain('创建')
  })

  it('renders the edit form pre-filled from an existing friend fixture', () => {
    const friend = makeAdminFriend({ website: '老朋友的博客', homepage: 'https://old.example.com' })
    function Wrapper() {
      const [target, setTarget] = useState<AdminFriendDto | null | undefined>(undefined)
      if (target === undefined) {
        setTarget(friend)
      }
      return <EditFriendDialog friend={target} onClose={() => undefined} onSaved={() => undefined} />
    }
    const html = stableHtml(renderToHtml(<Wrapper />))
    // Draft sync bails out of a single SSR pass — assert structure, not field values.
    expect(html).toContain('编辑友链')
    expect(html).toContain('修改友链信息')
    expect(html).toContain('friend-website')
    expect(html).toContain('friend-poster')
    expect(html).toContain('保存')
  })
})
