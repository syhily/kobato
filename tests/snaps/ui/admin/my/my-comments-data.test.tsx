import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MyCommentItem } from '@/routes/admin/me/comments'

import { makeCommentBody } from '#/_helpers/catalog'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { MyCommentsView } from '@/ui/admin/my/MyCommentsView'

const queryMocks = mockTanstackQuery()

queryMocks.query = {
  data: null as unknown,
  isLoading: false,
  isPending: false,
  isFetching: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}

queryMocks.mutation = { mutate: vi.fn(), isPending: false }

queryMocks.infinite = {
  data: { pages: [] as { items: MyCommentItem[]; total: number; hasMore: boolean }[] },
  isLoading: false,
  isPending: false,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  error: null as unknown,
  fetchNextPage: vi.fn(),
}

queryMocks.queryClient = { invalidateQueries: vi.fn() }

// MyCommentsView's list hook is stubbed via the mock-react-query singleton
// (the orpcQuery option builder never runs its network path); mirrors the
// tags/musics-view pattern.

// LazyCommentBodyEditor's lazy boundary is hard to assert under SSR — stub it to a sentinel element.
vi.mock('@/ui/public/comments/LazyCommentBodyEditor', () => ({
  LazyCommentBodyEditor: () => <div data-testid="comment-body-editor">CommentBodyEditor</div>,
}))

let seq = 0
function makeContent(text: string): string {
  return `<p>${text}</p>`
}

function makeMyComment(overrides: Partial<MyCommentItem> = {}): MyCommentItem {
  seq += 1
  return {
    id: overrides.id ?? `c-${seq}`,
    body: overrides.body ?? makeCommentBody(`Comment ${seq}`),
    content: overrides.content ?? makeContent(`Comment ${seq}`),
    createdAtIso: overrides.createdAtIso ?? '2024-03-12T08:30:00.000Z',
    deletedAtIso: overrides.deletedAtIso ?? null,
    deleteRequestedAtIso: overrides.deleteRequestedAtIso ?? null,
    isPending: overrides.isPending ?? false,
    entity: overrides.entity ?? { title: 'Hello World', permalink: '/posts/hello' },
    parent: overrides.parent ?? null,
  }
}

const currentUser = { id: 'user-1', name: 'Alice', email: 'alice@example.com' }

const defaultProps = {
  status: 'all' as const,
  q: '',
  entity: null,
  entityOptions: [],
  currentUser,
}

describe('snapshot: MyCommentsView data-loaded', () => {
  beforeEach(() => {
    queryMocks.infinite = {
      data: { pages: [] },
      isLoading: false,
      isPending: false,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      error: null,
      fetchNextPage: vi.fn(),
    }
    queryMocks.query = {
      data: { entities: [] },
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
  })

  it('renders the populated list when data resolves (covers the items.map branch)', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      data: {
        pages: [
          {
            items: [
              makeMyComment({ id: '1', content: makeContent('First thought') }),
              makeMyComment({
                id: '2',
                content: makeContent('Second thought'),
                isPending: true,
                entity: { title: 'Draft Post', permalink: '/posts/draft' },
              }),
            ],
            total: 2,
            hasMore: false,
          },
        ],
      },
    }
    const html = stableHtml(renderInRouter(<MyCommentsView {...defaultProps} />, '/admin/me/comments'))
    expect(html).toContain('我的评论')
    expect(html).toContain('共')
    expect(html).toContain('2')
    expect(html).toContain('条评论')
    expect(html).toContain('data-slot="my-comment-row"')
    expect(html).toContain('First thought')
    expect(html).toContain('Second thought')
    expect(html).toContain('Alice')
    // Entity link affordance (renders when item.entity is non-null).
    expect(html).toContain('Hello World')
    expect(html).toContain('/posts/hello')
    expect(html).toContain('Draft Post')
    expect(html).toContain('待审核')
    // End-of-list sentinel (no hasMore + items.length > 0).
    expect(html).toContain('已加载全部评论')
    expect(html).toContain('aria-label="修改评论"')
    expect(html).toContain('aria-label="申请删除"')
  })

  it('renders the empty-state branch when the resolved list is empty', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      data: { pages: [{ items: [], total: 0, hasMore: false }] },
    }
    const html = stableHtml(renderInRouter(<MyCommentsView {...defaultProps} />, '/admin/me/comments'))
    expect(html).toContain('我的评论')
    expect(html).toContain('暂无评论')
    // Total still renders (0).
    expect(html).toContain('0')
    expect(html).not.toContain('data-slot="my-comment-row"')
    expect(html).not.toContain('已加载全部评论')
  })

  it('renders the delete-requested branch with the revoke affordance', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      data: {
        pages: [
          {
            items: [
              makeMyComment({
                id: '1',
                content: makeContent('Please hide this'),
                deleteRequestedAtIso: '2024-03-10T00:00:00.000Z',
              }),
            ],
            total: 1,
            hasMore: false,
          },
        ],
      },
    }
    const html = stableHtml(renderInRouter(<MyCommentsView {...defaultProps} />, '/admin/me/comments'))
    expect(html).toContain('已申请删除')
    // Pending delete swaps "申请删除" for "撤回删除".
    expect(html).toContain('aria-label="撤回删除"')
    expect(html).toContain('撤回删除')
    // Edit hidden while a delete is pending (canEdit === false).
    expect(html).not.toContain('aria-label="修改评论"')
  })

  it('renders the soft-deleted branch without action affordances', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      data: {
        pages: [
          {
            items: [
              makeMyComment({
                id: '1',
                content: makeContent('Gone'),
                deletedAtIso: '2024-03-09T00:00:00.000Z',
              }),
            ],
            total: 1,
            hasMore: false,
          },
        ],
      },
    }
    const html = stableHtml(renderInRouter(<MyCommentsView {...defaultProps} />, '/admin/me/comments'))
    expect(html).toContain('已删除')
    expect(html).not.toContain('aria-label="修改评论"')
    expect(html).not.toContain('aria-label="申请删除"')
    expect(html).not.toContain('aria-label="撤回删除"')
  })

  it('renders the parent-reply hint branch for a nested comment', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      data: {
        pages: [
          {
            items: [
              makeMyComment({
                id: '1',
                content: makeContent('A reply'),
                parent: { name: 'Bob', excerpt: 'Original thought', isDeleted: false },
              }),
            ],
            total: 1,
            hasMore: false,
          },
        ],
      },
    }
    const html = stableHtml(renderInRouter(<MyCommentsView {...defaultProps} />, '/admin/me/comments'))
    expect(html).toContain('回复')
    expect(html).toContain('Bob')
    expect(html).toContain('Original thought')
  })

  it('renders the load-more sentinel when hasMore is true', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      data: {
        pages: [{ items: [makeMyComment({ id: '1' })], total: 30, hasMore: true }],
      },
      hasNextPage: true,
      isFetchingNextPage: false,
    }
    const html = stableHtml(renderInRouter(<MyCommentsView {...defaultProps} />, '/admin/me/comments'))
    // hasNextPage → sentinel.
    expect(html).toContain('class="h-1"')
    expect(html).not.toContain('已加载全部评论')
  })
})
