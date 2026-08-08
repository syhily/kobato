import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'
import type { CommentActions } from '@/ui/admin/comments/useCommentsController'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { AdminCommentRow } from '@/ui/admin/comments/AdminCommentRow'
import { CommentsView } from '@/ui/admin/comments/CommentsView'
import { EditUserDialog } from '@/ui/admin/comments/EditUserDialog'

const queryMocks = mockTanstackQuery()

queryMocks.query = {
  data: null as unknown,
  isPending: false,
  isLoading: false,
  isFetching: false,
  error: null,
  refetch: vi.fn(),
}

queryMocks.mutation = { mutate: vi.fn(), isPending: false }

queryMocks.infinite = {
  data: { pages: [] as unknown[] },
  isLoading: false,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  error: null,
  fetchNextPage: vi.fn(),
}

queryMocks.queryClient = { invalidateQueries: vi.fn() }

// Stub IntersectionObserver to silence its SSR warning (expected in this environment).
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

// Queries never fetch under SSR, so the controller is stubbed with a
// hoisted singleton (same pattern as tags/musics-view specs) to cover the
// data-loaded render path.

const controllerState = vi.hoisted(() => ({
  comments: [] as AdminComment[],
  total: 0,
  statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
  hasMore: false,
  isLoading: false,
  isFetchingNextPage: false,
}))

// Presentational row: all affordances flow through `actions`; hoisted no-ops for the mock factory.
const stubActions = vi.hoisted((): CommentActions => {
  const noop = () => {}
  return {
    approve: noop,
    remove: noop,
    approveDeletion: noop,
    rejectDeletion: noop,
    edit: noop,
    reply: noop,
    editUser: noop,
    filterByPage: noop,
    filterByAuthor: noop,
    isApproving: () => false,
    isRemoving: () => false,
    isResolvingDeletion: () => false,
  }
})

vi.mock('@/ui/admin/comments/useCommentsController', async () => {
  const actual = await vi.importActual<typeof import('@/ui/admin/comments/useCommentsController')>(
    '@/ui/admin/comments/useCommentsController',
  )
  return {
    ...actual,
    useCommentsController: () => ({
      comments: controllerState.comments,
      total: controllerState.total,
      statusCounts: controllerState.statusCounts,
      hasMore: controllerState.hasMore,
      isLoading: controllerState.isLoading,
      isFetchingNextPage: controllerState.isFetchingNextPage,
      sentinelRef: { current: null },
      actions: stubActions,
      confirm: null,
      closeConfirm: vi.fn(),
      updateCommentBody: vi.fn(),
      invalidateList: vi.fn(),
    }),
  }
})

// The real `useFilterPills` still queries for autocomplete lookups — inert
// defaults keep the chrome network-free.

let commentSeq = 0

function makeAdminComment(overrides: Partial<AdminComment> = {}): AdminComment {
  commentSeq += 1
  const body: CommentBody = [
    {
      _type: 'block',
      _key: `b${commentSeq}`,
      style: 'normal',
      children: [{ _type: 'span', _key: `s${commentSeq}`, text: `Comment body ${commentSeq}` }],
    },
  ]
  return {
    id: String(commentSeq),
    createAt: '2024-03-12T08:30:00.000Z',
    updatedAt: '2024-03-12T08:30:00.000Z',
    deleteAt: null,
    deleteRequestedAt: null,
    body,
    type: 'post',
    ownerId: null,
    userId: String(commentSeq),
    isVerified: false,
    rid: 0,
    isCollapsed: false,
    isPending: false,
    isPinned: false,
    voteUp: 0,
    voteDown: 0,
    rootId: null,
    name: `Author ${commentSeq}`,
    emailVerified: false,
    link: null,
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    content: `Comment body ${commentSeq}`,
    ua: null,
    ip: null,
    email: 'author@example.com',
    pageTitle: null,
    pagePublicId: null,
    pageCover: null,
    pagePermalink: null,
    ...overrides,
  }
}

const rowProps = {
  parentLookup: new Map<string, AdminComment>(),
  actions: stubActions,
}

describe('snapshot: CommentsView', () => {
  beforeEach(() => {
    // Reset the hoisted controller state per case.
    controllerState.comments = []
    controllerState.total = 0
    controllerState.statusCounts = { all: 0, pending: 0, approved: 0, deleteRequested: 0 }
    controllerState.hasMore = false
    controllerState.isLoading = false
    controllerState.isFetchingNextPage = false
  })

  // Chrome + skeleton render while the first page is still pending.
  it('renders the page chrome with title and loading skeleton', () => {
    controllerState.isLoading = true
    const html = stableHtml(
      renderInRouter(
        <CommentsView currentUserName="Alice" currentUserEmail="a@b.com" initialFilters={[]} />,
        '/admin/comments',
      ),
    )
    expect(html).toContain('评论管理')
    expect(html).toContain('审核、回复、编辑站点评论')
    // Loading branch — pulse placeholders instead of the empty state.
    expect(html).toContain('animate-pulse')
    expect(html).not.toContain('暂无评论')
  })

  it('renders the data-loaded branch with comment rows and filter chrome', () => {
    controllerState.comments = [
      makeAdminComment({
        id: '1',
        name: 'Alice',
        pageTitle: 'Hello World',
        pagePermalink: '/posts/hello',
        badgeName: '站长',
        badgeColor: '#007a82',
        badgeTextColor: '#ffffff',
      }),
      makeAdminComment({
        id: '2',
        name: 'Bob',
        isPending: true,
        pageTitle: 'Second Post',
        pagePermalink: '/posts/second',
      }),
    ]
    controllerState.total = 2
    controllerState.statusCounts = { all: 2, pending: 1, approved: 1, deleteRequested: 0 }
    const html = stableHtml(
      renderInRouter(
        <CommentsView currentUserName="Alice" currentUserEmail="a@b.com" initialFilters={[]} />,
        '/admin/comments',
      ),
    )
    expect(html).toContain('评论管理')
    // Approved-row branch (map callback executed for Alice).
    expect(html).toContain('Alice')
    expect(html).toContain('已审核')
    // Pending-row branch (map callback executed for Bob, distinct status).
    expect(html).toContain('Bob')
    expect(html).toContain('待审核')
    // Page-title button affordance.
    expect(html).toContain('Hello World')
    expect(html).toContain('Second Post')
    // Author badge rendered through the conditional branch.
    expect(html).toContain('站长')
    // End-of-list sentinel (rendered when !hasMore && comments.length > 0).
    expect(html).toContain('已加载全部评论')
    // Filter-chrome affordance (the status operator trigger).
    expect(html).toContain('全部')
  })

  it('renders the empty-state branch when the loaded list is empty', () => {
    const html = stableHtml(
      renderInRouter(
        <CommentsView currentUserName="Alice" currentUserEmail="a@b.com" initialFilters={[]} />,
        '/admin/comments',
      ),
    )
    expect(html).toContain('评论管理')
    expect(html).toContain('暂无评论')
    expect(html).not.toContain('已加载全部评论')
  })

  it('renders the loading-more sentinel when hasMore is true', () => {
    controllerState.comments = [makeAdminComment({ id: '9', name: 'Solo' })]
    controllerState.total = 20
    controllerState.statusCounts = { all: 20, pending: 0, approved: 20, deleteRequested: 0 }
    controllerState.hasMore = true
    const html = stableHtml(
      renderInRouter(
        <CommentsView currentUserName="Alice" currentUserEmail="a@b.com" initialFilters={[]} />,
        '/admin/comments',
      ),
    )
    expect(html).toContain('Solo')
    // hasMore → sentinel div.
    expect(html).toContain('class="h-1"')
  })

  it('renders the fetching-next-page copy while the next page is loading', () => {
    controllerState.comments = [makeAdminComment({ id: '10', name: 'Solo' })]
    controllerState.total = 20
    controllerState.statusCounts = { all: 20, pending: 0, approved: 20, deleteRequested: 0 }
    controllerState.hasMore = true
    controllerState.isFetchingNextPage = true
    const html = stableHtml(
      renderInRouter(
        <CommentsView currentUserName="Alice" currentUserEmail="a@b.com" initialFilters={[]} />,
        '/admin/comments',
      ),
    )
    expect(html).toContain('加载中…')
  })
})

describe('snapshot: AdminCommentRow', () => {
  it('renders an approved comment with author, body and actions', () => {
    const comment = makeAdminComment({
      name: 'Alice',
      pageTitle: 'Hello World',
      pagePermalink: '/posts/hello',
      badgeName: '站长',
      badgeColor: '#007a82',
      badgeTextColor: '#ffffff',
    })
    const html = stableHtml(renderInRouter(<AdminCommentRow comment={comment} {...rowProps} />))
    expect(html).toContain('data-slot="admin-comment-row"')
    expect(html).toContain('Alice')
    expect(html).toContain('Comment body')
    // Status badge for a non-pending, non-delete-requested comment.
    expect(html).toContain('已审核')
    expect(html).toContain('站长')
    // Action labels (the sm:inline spans are still emitted in SSR output).
    expect(html).toContain('编辑评论')
    expect(html).toContain('编辑用户')
    expect(html).toContain('查看文章')
    // The page title button used for "filter by page".
    expect(html).toContain('Hello World')
    // Avatar fallback initial derived from the author name.
    expect(html).toContain('A')
  })

  it('renders a pending comment with an approve affordance', () => {
    const comment = makeAdminComment({ isPending: true })
    const html = stableHtml(renderInRouter(<AdminCommentRow comment={comment} {...rowProps} />))
    expect(html).toContain('待审核')
    expect(html).toContain('aria-label="通过评论"')
  })

  it('renders a delete-requested comment with accept/reject controls', () => {
    const comment = makeAdminComment({ deleteRequestedAt: '2024-03-10T00:00:00.000Z' })
    const html = stableHtml(renderInRouter(<AdminCommentRow comment={comment} {...rowProps} />))
    expect(html).toContain('申请删除')
    expect(html).toContain('aria-label="拒绝删除申请"')
    expect(html).toContain('aria-label="同意删除申请"')
  })

  it('renders the author website link when a safe href resolves', () => {
    const comment = makeAdminComment({ name: 'Bob', link: 'https://bob.example.com' })
    const html = stableHtml(renderInRouter(<AdminCommentRow comment={comment} {...rowProps} />))
    expect(html).toContain('href="https://bob.example.com"')
    expect(html).toContain('rel="nofollow noreferrer"')
    expect(html).toContain('访问 Bob 的网站')
  })

  it('renders the "replied to" hint when the parent comment is in the lookup map', () => {
    const parent = makeAdminComment({ id: '100', name: 'Carol' })
    const child = makeAdminComment({
      id: '101',
      rid: 100,
      rootId: '100',
      name: 'Dave',
    })
    const parentLookup = new Map<string, AdminComment>([[String(parent.id), parent]])
    const html = stableHtml(
      renderInRouter(<AdminCommentRow comment={child} {...rowProps} parentLookup={parentLookup} />),
    )
    expect(html).toContain('回复')
    expect(html).toContain('Carol')
  })
})

// Date/text filter editors are covered in shared/filter-bar.test.tsx.

describe('snapshot: EditUserDialog', () => {
  // comment=null → closed dialog renders nothing visible.
  it('renders nothing user-visible in the closed state', () => {
    const html = stableHtml(renderInRouter(<EditUserDialog comment={null} onClose={() => {}} onSaved={() => {}} />))
    expect(html).not.toContain('编辑评论用户')
  })

  // Open dialog mounts via a portal Base UI doesn't emit under SSR; keep
  // the render call so a synchronous throw is caught.
  it('does not throw when rendered with an open comment target', () => {
    const comment = makeAdminComment({ name: 'Alice', email: 'alice@example.com' })
    expect(() =>
      renderInRouter(<EditUserDialog comment={comment} onClose={() => {}} onSaved={() => {}} />),
    ).not.toThrow()
  })
})
