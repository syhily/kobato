import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MyCommentItem } from '@/routes/admin/me/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { MyCommentsView } from '@/ui/admin/my/MyCommentsView'

const queryMocks = mockTanstackQuery()

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

queryMocks.queryClient = { invalidateQueries: vi.fn() }

// `MyCommentsView` reads its row list from a `useInfiniteQuery` against
// `orpc.comments.loadMine` and its entity picker from the pill hook's
// `useQueries` against `orpc.comments.searchMineEntities`. Both go through
// `@tanstack/react-query`, so we stub the hooks through the
// `#/_helpers/mock-react-query` singleton (mirroring `musics-view.test.tsx`)
// and mutate the resolved data between cases.
//
// The render-path branches we target here:
//   - the URL-derived pill derivation (controlled `useFilterPills`),
//   - the entity search items: loader-provided `entityOptions` branch, live
//     search-results branch, and the `current not in items` pinning,
//   - `items` memo flatMap over the infinite slot's `data.pages`,
//   - the loading skeleton / empty-state / populated row map branches,
//   - the `hasNextPage` sentinel + the "加载中…" / "已加载全部评论" copies,
//   - per-row conditional branches: pending / delete-requested / deleted
//     badges, the parent-reply hint (deleted vs live), the edit / request-
//     delete / cancel-delete action split.

vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

// --- fixtures ----------------------------------------------------------------

let itemSeq = 0

function makeBody(text: string): CommentBody {
  itemSeq += 1
  return [
    {
      _type: 'block',
      _key: `b${itemSeq}`,
      style: 'normal',
      children: [{ _type: 'span', _key: `s${itemSeq}`, text }],
    },
  ]
}

function makeItem(overrides: Partial<MyCommentItem> = {}): MyCommentItem {
  return {
    id: String(++itemSeq),
    body: makeBody(`Body ${itemSeq}`),
    createdAtIso: '2024-03-12T08:30:00.000Z',
    deletedAtIso: null,
    deleteRequestedAtIso: null,
    isPending: false,
    entity: { title: 'Hello World', permalink: '/posts/hello' },
    parent: null,
    ...overrides,
  }
}

const CURRENT_USER = { id: 'u1', name: 'Alice', email: 'alice@example.com' }

function renderMy(props: Partial<Parameters<typeof MyCommentsView>[0]> = {}) {
  return stableHtml(
    renderInRouter(
      <MyCommentsView status="all" q="" entity={null} entityOptions={[]} currentUser={CURRENT_USER} {...props} />,
      '/admin/me/comments',
    ),
  )
}

function resetInfinite() {
  queryMocks.infinite.data = { pages: [] }
  queryMocks.infinite.isLoading = false
  queryMocks.infinite.isPending = false
  queryMocks.infinite.isFetching = false
  queryMocks.infinite.isFetchingNextPage = false
  queryMocks.infinite.hasNextPage = false
  queryMocks.infinite.error = null
}

// --- render-branch coverage --------------------------------------------------

describe('snapshot: MyCommentsView render branches', () => {
  beforeEach(() => {
    itemSeq = 0
    resetInfinite()
    queryMocks.query.data = null
    queryMocks.query.isLoading = false
    queryMocks.query.isPending = false
    queryMocks.query.isFetching = false
    queryMocks.query.isError = false
    queryMocks.query.error = null
  })

  it('renders the loading skeleton while the list query is pending', () => {
    queryMocks.infinite.isLoading = true
    queryMocks.infinite.isPending = true
    const html = renderMy()
    expect(html).toContain('我的评论')
    // Skeleton branch — three pulse placeholders.
    expect(html).toContain('animate-pulse')
    // The total-count reads from pages[0].total; with no pages yet it falls
    // back to 0.
    expect(html).toMatch(/共\s*<span[^>]*>\s*0\s*<\/span>\s*条评论/u)
  })

  it('renders the empty-state branch when the list resolves with no items', () => {
    queryMocks.infinite.data = {
      pages: [{ items: [], total: 0, hasMore: false }],
    }
    const html = renderMy()
    expect(html).toContain('暂无评论')
    // The count is split across a <span>: `共 <span>0</span> 条评论`.
    expect(html).toMatch(/共\s*<span[^>]*>\s*0\s*<\/span>\s*条评论/u)
    // End-of-list sentinel must NOT fire when there are no items.
    expect(html).not.toContain('已加载全部评论')
  })

  it('runs the items.map branch with a populated list and the end-of-list sentinel', () => {
    queryMocks.infinite.data = {
      pages: [
        {
          items: [
            makeItem({ id: '1', entity: { title: 'First Post', permalink: '/posts/first' } }),
            makeItem({ id: '2', entity: { title: 'Second Post', permalink: '/posts/second' } }),
          ],
          total: 2,
          hasMore: false,
        },
      ],
    }
    const html = renderMy()
    expect(html).toContain('data-slot="my-comment-row"')
    expect(html).toContain('Alice')
    expect(html).toContain('First Post')
    expect(html).toContain('Second Post')
    // Row body rendered through PortableTextBody.
    expect(html).toContain('Body ')
    // Entity permalink anchor.
    expect(html).toContain('href="/posts/first"')
    // Non-deleted, non-pending row → request-delete action.
    expect(html).toContain('aria-label="申请删除"')
    expect(html).toContain('aria-label="修改评论"')
    // End-of-list sentinel fires (items > 0 && !hasNextPage).
    expect(html).toContain('已加载全部评论')
    expect(html).toMatch(/共\s*<span[^>]*>\s*2\s*<\/span>\s*条评论/u)
  })

  it('renders the pending badge and the entity hint for a pending item', () => {
    queryMocks.infinite.data = {
      pages: [
        {
          items: [makeItem({ id: '3', isPending: true })],
          total: 1,
          hasMore: false,
        },
      ],
    }
    const html = renderMy()
    expect(html).toContain('待审核')
    // Pending items can still be edited / deleted.
    expect(html).toContain('aria-label="修改评论"')
    expect(html).toContain('aria-label="申请删除"')
  })

  it('renders the delete-requested badge and the cancel-delete action', () => {
    queryMocks.infinite.data = {
      pages: [
        {
          items: [
            makeItem({
              id: '4',
              deleteRequestedAtIso: '2024-03-10T00:00:00.000Z',
            }),
          ],
          total: 1,
          hasMore: false,
        },
      ],
    }
    const html = renderMy()
    expect(html).toContain('已申请删除')
    // Pending-delete row exposes the cancel-delete affordance, not the
    // request-delete one.
    expect(html).toContain('aria-label="撤回删除"')
    expect(html).not.toContain('aria-label="申请删除"')
  })

  it('renders the deleted badge and hides the action row entirely', () => {
    queryMocks.infinite.data = {
      pages: [
        {
          items: [
            makeItem({
              id: '5',
              deletedAtIso: '2024-03-09T00:00:00.000Z',
            }),
          ],
          total: 1,
          hasMore: false,
        },
      ],
    }
    const html = renderMy()
    expect(html).toContain('已删除')
    // No action buttons for a deleted row.
    expect(html).not.toContain('aria-label="修改评论"')
    expect(html).not.toContain('aria-label="申请删除"')
    expect(html).not.toContain('aria-label="撤回删除"')
  })

  it('renders the parent-reply hint pointing at a live parent comment', () => {
    queryMocks.infinite.data = {
      pages: [
        {
          items: [
            makeItem({
              id: '6',
              parent: { name: 'Carol', excerpt: 'Nice post!', isDeleted: false },
            }),
          ],
          total: 1,
          hasMore: false,
        },
      ],
    }
    const html = renderMy()
    expect(html).toContain('回复')
    expect(html).toContain('Carol')
    // Live parent → the excerpt is quoted inline.
    expect(html).toContain('Nice post!')
  })

  it('renders the parent-reply hint with the deleted-parent fallback', () => {
    queryMocks.infinite.data = {
      pages: [
        {
          items: [
            makeItem({
              id: '7',
              parent: { name: 'Ghost', excerpt: '', isDeleted: true },
            }),
          ],
          total: 1,
          hasMore: false,
        },
      ],
    }
    const html = renderMy()
    expect(html).toContain('回复')
    // Deleted-parent branch copy.
    expect(html).toContain('一条已删除的评论')
  })

  it('renders a row whose entity is null (orphaned post) without the entity anchor', () => {
    queryMocks.infinite.data = {
      pages: [
        {
          items: [makeItem({ id: '8', entity: null })],
          total: 1,
          hasMore: false,
        },
      ],
    }
    const html = renderMy()
    expect(html).toContain('data-slot="my-comment-row"')
    // No permalink anchor when entity is null.
    expect(html).not.toContain('href="/posts/')
  })

  it('renders the load-more sentinel and hides the end-of-list copy when hasNextPage is true', () => {
    queryMocks.infinite.data = {
      pages: [{ items: [makeItem({ id: '9' })], total: 50, hasMore: true }],
    }
    queryMocks.infinite.hasNextPage = true
    const html = renderMy()
    // IntersectionObserver sentinel div.
    expect(html).toContain('class="h-1"')
    // End-of-list copy suppressed while there is more to load.
    expect(html).not.toContain('已加载全部评论')
  })

  it('renders the fetching-next-page copy when isFetchingNextPage is true', () => {
    queryMocks.infinite.data = {
      pages: [{ items: [makeItem({ id: '10' })], total: 50, hasMore: true }],
    }
    queryMocks.infinite.hasNextPage = true
    queryMocks.infinite.isFetchingNextPage = true
    const html = renderMy()
    expect(html).toContain('加载中')
  })

  it('renders the active-filter body slot when status / entity / q props pin filters', () => {
    queryMocks.infinite.data = {
      pages: [{ items: [makeItem({ id: '11' })], total: 1, hasMore: false }],
    }
    const html = renderMy({
      status: 'pending',
      q: 'hello',
      entity: 'post:1',
      entityOptions: [{ value: 'post:1', label: 'Pinned Post' }],
    })
    // The status filter label resolves through MY_STATUS_OPTIONS.
    expect(html).toContain('待审')
    // Clear-filters affordance only appears with active filters.
    expect(html).toContain('清除')
    // Row still renders under the active filter.
    expect(html).toContain('data-slot="my-comment-row"')
  })

  it('runs the entity items memo over the loader-provided entityOptions when no live search is active', () => {
    queryMocks.infinite.data = {
      pages: [{ items: [makeItem({ id: '12' })], total: 1, hasMore: false }],
    }
    // Pass multiple entityOptions so the hook's items derivation runs over them.
    const html = renderMy({
      entityOptions: [
        { value: 'post:1', label: 'Alpha' },
        { value: 'post:2', label: 'Beta' },
      ],
    })
    // Header chrome + row rendered, proving the memo didn't throw.
    expect(html).toContain('我的评论')
    expect(html).toContain('data-slot="my-comment-row"')
  })

  it('runs the entity items pinning branch when the pinned entity is not in entityOptions', () => {
    queryMocks.infinite.data = {
      pages: [{ items: [makeItem({ id: '13' })], total: 1, hasMore: false }],
    }
    const html = renderMy({
      // Pinned entity absent from the options list — the hook prepends a
      // synthetic entry so the filter pill can resolve its label.
      entity: 'post:missing',
      entityOptions: [{ value: 'post:1', label: 'Known Post' }],
    })
    // Page filter pill renders (the entity field).
    expect(html).toContain('文章')
    expect(html).toContain('data-slot="my-comment-row"')
  })

  it('renders the error-state branch when the list query errors', () => {
    queryMocks.infinite.error = new Error('boom')
    queryMocks.infinite.data = { pages: [] }
    const html = renderMy()
    // The view still renders its chrome — the error surfaces via a toast
    // inside an effect, but the render path falls through to the empty
    // branch because `items` is `[]`.
    expect(html).toContain('我的评论')
    expect(html).toContain('暂无评论')
  })
})
