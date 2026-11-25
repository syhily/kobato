import type { AdminCommentWire as AdminComment } from '@kobato/api/contracts/admin/comments'
import type { CommentFilterFieldKey } from '@kobato/web-admin/ui/comments/filter-fields'
import type { CommentActions } from '@kobato/web-admin/ui/comments/use-comments-controller'
import type { ActiveFilter } from '@kobato/web-admin/ui/shared/filter-bar/filter-pills-reducer'

import { makeAdminComment } from '@kobato/api/tests/utils/catalog'
import { mockTanstackQuery } from '@kobato/test/mock-react-query'
import { CommentsView } from '@kobato/web-admin/ui/comments/CommentsView'
import { renderInRouter, stableHtml } from '@kobato/web-public/tests/utils/render'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const controllerState = vi.hoisted(() => ({
  comments: [] as AdminComment[],
  total: 0,
  statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
  hasMore: false,
  isLoading: false,
  isFetchingNextPage: false,
}))

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

const commentsControllerMod = await import('@kobato/web-admin/ui/comments/use-comments-controller')
vi.spyOn(commentsControllerMod, 'useCommentsController').mockImplementation((() => ({
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
})) as never)

afterAll(() => {
  vi.restoreAllMocks()
})

function resetController() {
  controllerState.comments = []
  controllerState.total = 0
  controllerState.statusCounts = { all: 0, pending: 0, approved: 0, deleteRequested: 0 }
  controllerState.hasMore = false
  controllerState.isLoading = false
  controllerState.isFetchingNextPage = false
}

function renderComments(initialFilters: ActiveFilter<CommentFilterFieldKey>[] = []) {
  return stableHtml(
    renderInRouter(
      <CommentsView currentUserName="Alice" currentUserEmail="a@b.com" initialFilters={initialFilters} />,
      '/admin/comments',
    ),
  )
}

describe('snapshot: CommentsView render branches', () => {
  beforeEach(() => {
    resetController()
    queryMocks.query = {
      data: null,
      isPending: false,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
  })

  it('runs the page search-items map branch when searchPages resolves with pages', () => {
    queryMocks.query = {
      ...queryMocks.query,
      data: {
        pages: [
          { key: 'post-1', title: 'Hello World' },
          { key: 'post-2', title: 'Second Post' },
        ],
        authors: [],
      },
    }
    controllerState.comments = [makeAdminComment({ id: '1', name: 'Alice', pageTitle: 'Hello World' })]
    controllerState.total = 1
    controllerState.statusCounts = { all: 1, pending: 0, approved: 1, deleteRequested: 0 }
    const html = renderComments()
    expect(html).toContain('Alice')
    expect(html).toContain('Hello World')
    expect(html).toContain('已加载全部评论')
  })

  it('runs the author search-items map branch when searchAuthors resolves with authors', () => {
    queryMocks.query = {
      ...queryMocks.query,
      data: {
        pages: [],
        authors: [
          { id: 'u1', name: 'Carol' },
          { id: 'u2', name: 'Dave' },
        ],
      },
    }
    controllerState.comments = [makeAdminComment({ id: '2', name: 'Carol' })]
    controllerState.total = 1
    controllerState.statusCounts = { all: 1, pending: 0, approved: 1, deleteRequested: 0 }
    const html = renderComments()
    expect(html).toContain('Carol')
    expect(html).toContain('已加载全部评论')
  })

  it('runs the page items pinning branch when the active page filter is not in fetched items', () => {
    queryMocks.query = {
      ...queryMocks.query,
      data: {
        pages: [{ key: 'post-2', title: 'Other Post' }],
        authors: [],
      },
    }
    const activeFilters: ActiveFilter<CommentFilterFieldKey>[] = [
      { field: 'page', value: 'post-1', label: 'Pinned Page' },
    ]
    controllerState.comments = [makeAdminComment({ id: '3', name: 'Eve' })]
    controllerState.total = 1
    controllerState.statusCounts = { all: 1, pending: 0, approved: 1, deleteRequested: 0 }
    const html = renderComments(activeFilters)
    expect(html).toContain('文章')
    expect(html).toContain('Eve')
    expect(html).toContain('清除')
  })

  it('runs the author items pinning branch when the active author filter is not in fetched items', () => {
    queryMocks.query = {
      ...queryMocks.query,
      data: {
        pages: [],
        authors: [{ id: 'u2', name: 'Fetched Author' }],
      },
    }
    const activeFilters: ActiveFilter<CommentFilterFieldKey>[] = [
      { field: 'author', value: 'u-missing', label: 'Pinned Author' },
    ]
    controllerState.comments = [makeAdminComment({ id: '4', name: 'Frank' })]
    controllerState.total = 1
    controllerState.statusCounts = { all: 1, pending: 0, approved: 1, deleteRequested: 0 }
    const html = renderComments(activeFilters)
    expect(html).toContain('评论人')
    expect(html).toContain('Frank')
    expect(html).toContain('清除')
  })

  it('renders the row without the end-of-list copy when hasMore is true', () => {
    controllerState.comments = [makeAdminComment({ id: '5', name: 'Solo' })]
    controllerState.total = 20
    controllerState.statusCounts = { all: 20, pending: 0, approved: 20, deleteRequested: 0 }
    controllerState.hasMore = true
    const html = renderComments()
    expect(html).toContain('Solo')
    expect(html).not.toContain('已加载全部评论')
  })

  it('renders the "加载中…" copy when isFetchingNextPage is true', () => {
    controllerState.comments = [makeAdminComment({ id: '7', name: 'Paging' })]
    controllerState.total = 20
    controllerState.statusCounts = { all: 20, pending: 0, approved: 20, deleteRequested: 0 }
    controllerState.hasMore = true
    controllerState.isFetchingNextPage = true
    const html = renderComments()
    expect(html).toContain('Paging')
    expect(html).toContain('加载中…')
    expect(html).not.toContain('已加载全部评论')
  })

  it('renders the end-of-list copy when comments exist but hasMore is false', () => {
    controllerState.comments = [makeAdminComment({ id: '6', name: 'Last' })]
    controllerState.total = 1
    controllerState.statusCounts = { all: 1, pending: 0, approved: 1, deleteRequested: 0 }
    controllerState.hasMore = false
    const html = renderComments()
    expect(html).toContain('Last')
    expect(html).toContain('已加载全部评论')
  })

  it('renders the parentLookup map branch when a row references a parent in the list', () => {
    const parent = makeAdminComment({ id: '100', name: 'Carol' })
    const child = makeAdminComment({
      id: '101',
      rid: 100,
      rootId: '100',
      name: 'Dave',
    })
    controllerState.comments = [parent, child]
    controllerState.total = 2
    controllerState.statusCounts = { all: 2, pending: 0, approved: 2, deleteRequested: 0 }
    const html = renderComments()
    expect(html).toContain('Carol')
    expect(html).toContain('Dave')
    expect(html).toContain('回复')
  })

  it('renders the empty-state branch when comments is empty', () => {
    const html = renderComments()
    expect(html).toContain('暂无评论')
    expect(html).not.toContain('已加载全部评论')
  })

  it('renders the active-filter body slot instead of the header slot when filters are active', () => {
    const activeFilters: ActiveFilter<CommentFilterFieldKey>[] = [
      { field: 'status', value: 'pending', label: '待审核' },
    ]
    const html = renderComments(activeFilters)
    expect(html).toContain('评论管理')
  })
})
