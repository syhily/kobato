import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MyCommentItem } from '@/routes/admin/me/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { MyCommentsView } from '@/ui/admin/my/MyCommentsView'

// `MyCommentsView` pulls its comment list through `useInfiniteQuery` against
// `orpc.comments.loadMine`. The query options builder is imported from
// `@/client/api/orpc-query` and shipped to the hook — but as long as the
// tanstack/react-query hook is stubbed, the option builder's network path
// never runs and we control the rendered state from the hoisted `infinite`
// singleton below. Mirrors the established pattern in
// `tags.test.tsx` / `musics-view.test.tsx`.

const queryMocks = vi.hoisted(() => ({
  query: {
    data: null as unknown,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  mutation: { mutate: vi.fn(), isPending: false },
  infinite: {
    data: { pages: [] as { items: MyCommentItem[]; total: number; hasMore: boolean }[] },
    isLoading: false,
    isPending: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    error: null as unknown,
    fetchNextPage: vi.fn(),
  },
  queryClient: { invalidateQueries: vi.fn() },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => queryMocks.query,
    useQueries: ({ queries }: { queries: unknown[] }) => queries.map(() => queryMocks.query),
    useMutation: () => queryMocks.mutation,
    useInfiniteQuery: () => queryMocks.infinite,
    useQueryClient: () => queryMocks.queryClient,
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// The edit dialog pulls in `CommentBodyEditor` which itself imports a lazy
// markdown editor; under SSR that lazy boundary leaves a placeholder that
// is hard to assert against. We stub the editor to a sentinel element so
// the dialog renders deterministically when an edit target is set (the
// other my-comments test already does the same).
vi.mock('@/ui/public/comments/CommentBodyEditor', () => ({
  CommentBodyEditor: () => <div data-testid="comment-body-editor">CommentBodyEditor</div>,
}))

// ───────────────────────────── fixtures ─────────────────────────────

let seq = 0
function makeBody(text: string): CommentBody {
  seq += 1
  return [
    {
      _type: 'block',
      _key: `b${seq}`,
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: `s${seq}`, text, marks: [] }],
    },
  ]
}

function makeMyComment(overrides: Partial<MyCommentItem> = {}): MyCommentItem {
  seq += 1
  return {
    id: overrides.id ?? `c-${seq}`,
    body: overrides.body ?? makeBody(`Comment ${seq}`),
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
    // Reset to "empty / not loading" between cases.
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
              makeMyComment({ id: '1', body: makeBody('First thought') }),
              makeMyComment({
                id: '2',
                body: makeBody('Second thought'),
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
    // Header + total count branch (total > 0).
    expect(html).toContain('我的评论')
    expect(html).toContain('共')
    expect(html).toContain('2')
    expect(html).toContain('条评论')
    // Row data-slot — emitted by the map callback.
    expect(html).toContain('data-slot="my-comment-row"')
    // Both comment bodies render through PortableTextBody.
    expect(html).toContain('First thought')
    expect(html).toContain('Second thought')
    // Current-user identity renders on each row.
    expect(html).toContain('Alice')
    // Entity link affordance (renders when item.entity is non-null).
    expect(html).toContain('Hello World')
    expect(html).toContain('/posts/hello')
    expect(html).toContain('Draft Post')
    // Pending-status badge branch.
    expect(html).toContain('待审核')
    // End-of-list sentinel (no hasMore + items.length > 0).
    expect(html).toContain('已加载全部评论')
    // Own-comment edit affordance branch (canEdit = !deleted && !pending-delete).
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
    // Empty-state copy.
    expect(html).toContain('暂无评论')
    // Total still renders (0).
    expect(html).toContain('0')
    // No row markup and no end-of-list sentinel.
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
                body: makeBody('Please hide this'),
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
    // When a delete is pending, the action row swaps "申请删除" for "撤回删除".
    expect(html).toContain('aria-label="撤回删除"')
    expect(html).toContain('撤回删除')
    // Edit affordance hidden while a delete is pending (canEdit === false).
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
                body: makeBody('Gone'),
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
    // No action affordances rendered for soft-deleted rows.
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
                body: makeBody('A reply'),
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
    // Parent-reply hint renders.
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
    // The intersection sentinel mounts when hasNextPage is true.
    expect(html).toContain('class="h-1"')
    // End-of-list copy is gated behind !hasNextPage so it should be absent here.
    expect(html).not.toContain('已加载全部评论')
  })
})
