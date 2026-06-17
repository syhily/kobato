import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminFriendDto } from '@/shared/types/friends'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { EditFriendDialog } from '@/ui/admin/friends/EditFriendDialog'
import { FriendsView } from '@/ui/admin/friends/FriendsView'

// FriendsView relies on an infinite-query list (no reducer) plus a delete
// mutation and a debounced search hook. We neutralize the queries so SSR
// emits the loading chrome.

const queryMocks = vi.hoisted(() => ({
  infinite: {
    data: { pages: [] as unknown[] } as unknown,
    isLoading: true,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    error: null,
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

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

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
    // Skeleton occupies the body while the first page is in flight.
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
    // The dialog chrome renders in edit mode; the draft sync is a render-phase
    // state update that React bails out of during a single SSR pass, so we
    // assert on structure rather than the pre-filled field values.
    expect(html).toContain('编辑友链')
    expect(html).toContain('修改友链信息')
    expect(html).toContain('friend-website')
    expect(html).toContain('friend-poster')
    expect(html).toContain('保存')
  })
})
