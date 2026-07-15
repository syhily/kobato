import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommentBody } from '@/shared/pt/comment-schema'
import type { AdminCommentWire as AdminComment } from '@/shared/types/comments'
import type { ActiveFilter } from '@/ui/admin/comments/useCommentsController'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { CommentsView } from '@/ui/admin/comments/CommentsView'

// The load-more sentinel is observed from `useInfiniteScrollSentinel` inside
// `useCommentsController`. Effects never run during synchronous SSR, but the
// constructor is still referenced at module load when the effect closure is
// built — silence the SSR warning by stubbing the global.
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

// --- hoisted controller singleton -------------------------------------------
//
// `CommentsView` reads its row list from `useCommentsController`, which owns
// a `useInfiniteQuery` against `orpc.admin.comments.loadAll`. Queries never
// fetch under synchronous SSR, so the list stays at its initial empty value.
// To exercise the data-loaded render branches we swap the controller's
// return value through this hoisted singleton, exactly mirroring what
// `comments-view.test.tsx` does.
//
// The render-path branches we target here are the ones the existing test
// leaves uncovered:
//   - the `pageItems` / `authorItems` useMemo factories (run only when the
//     secondary `useQuery` lookups resolve with data),
//   - the `current not in items` `.unshift` branch inside both memos,
//   - the `isFetchingNextPage` "加载中…" sentinel,
//   - the `!hasMore && comments.length > 0` "已加载全部评论" sentinel,
//   - the active-filter header/body slot split.

const controllerState = vi.hoisted(() => ({
  comments: [] as AdminComment[],
  total: 0,
  filters: [] as ActiveFilter[],
  statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
  hasMore: false,
  isLoading: false,
  isFetchingNextPage: false,
}))

vi.mock('@/ui/admin/comments/useCommentsController', async () => {
  const actual = await vi.importActual<typeof import('@/ui/admin/comments/useCommentsController')>(
    '@/ui/admin/comments/useCommentsController',
  )
  return {
    ...actual,
    useCommentsController: () => ({
      filters: controllerState.filters,
      dispatch: vi.fn(),
      comments: controllerState.comments,
      total: controllerState.total,
      statusCounts: controllerState.statusCounts,
      hasMore: controllerState.hasMore,
      isLoading: controllerState.isLoading,
      isFetchingNextPage: controllerState.isFetchingNextPage,
      sentinelRef: { current: null },
      approveComment: vi.fn(),
      removeComment: vi.fn(),
      updateCommentBody: vi.fn(),
      clearCommentDeleteRequest: vi.fn(),
      invalidateList: vi.fn(),
    }),
  }
})

// --- react-query singleton ---------------------------------------------------
//
// CommentsView fires four `useQuery` calls (searchPages, searchAuthors, plus
// two rehydrate variants). The mock below returns the same hoisted object for
// every call, so we pack both `.pages` and `.authors` arrays onto the shared
// `data` field. Each test reassigns the singleton to control which option
// list is populated.

const queryMocks = vi.hoisted(() => ({
  query: {
    data: null as unknown,
    isPending: false,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  },
  mutation: { mutate: vi.fn(), isPending: false },
  infinite: {
    data: { pages: [] as unknown[] },
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    error: null,
    fetchNextPage: vi.fn(),
  },
  queryClient: { invalidateQueries: vi.fn() },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => queryMocks.query,
    useMutation: () => queryMocks.mutation,
    useInfiniteQuery: () => queryMocks.infinite,
    useQueryClient: () => queryMocks.queryClient,
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock('@/ui/admin/shared/useDebouncedSearch', () => ({
  useDebouncedSearch: () => ['', vi.fn()],
}))

// --- fixtures ----------------------------------------------------------------

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

function resetController() {
  controllerState.comments = []
  controllerState.total = 0
  controllerState.filters = []
  controllerState.statusCounts = { all: 0, pending: 0, approved: 0, deleteRequested: 0 }
  controllerState.hasMore = false
  controllerState.isLoading = false
  controllerState.isFetchingNextPage = false
}

function renderComments(initialFilters: ActiveFilter[] = []) {
  return stableHtml(
    renderInRouter(
      <CommentsView currentUserName="Alice" currentUserEmail="a@b.com" initialFilters={initialFilters} />,
      '/admin/comments',
    ),
  )
}

// --- render-branch coverage --------------------------------------------------

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

  // The `pageItems` / `authorItems` useMemo factories (and their `.map` /
  // `.unshift` callbacks) run during render regardless of whether the
  // Combobox popover is open. Base UI only surfaces the option labels as
  // user-visible text once the popover mounts (browser-only), so we can't
  // assert on the dropdown text itself — but driving a populated query
  // result through the component exercises every line of the memo and
  // proves the render completes without throwing.

  it('runs the pageItems memo map branch when searchPages resolves with pages', () => {
    // Shared query data carries both `.pages` (for searchPages) and `.authors`
    // (for searchAuthors); the memo only reads the one it cares about.
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
    // Row map branch executed (memo factories ran before the row render).
    expect(html).toContain('Alice')
    // The page-title filter-by-page affordance on the row still emits the
    // title as a button label, proving the render reached the row body.
    expect(html).toContain('Hello World')
    // End-of-list sentinel runs (comments.length > 0 && !hasMore).
    expect(html).toContain('已加载全部评论')
  })

  it('runs the authorItems memo map branch when searchAuthors resolves with authors', () => {
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
    // Row rendered (authorItems memo ran before the row render).
    expect(html).toContain('Carol')
    expect(html).toContain('已加载全部评论')
  })

  it('runs the pageItems .unshift branch when the active page filter is not in fetched items', () => {
    // Active filter references a page that the autocomplete lookup did NOT
    // return — the memo must prepend it so the trigger shows the label.
    queryMocks.query = {
      ...queryMocks.query,
      data: {
        pages: [{ key: 'post-2', title: 'Other Post' }],
        authors: [],
      },
    }
    const activeFilters: ActiveFilter[] = [{ field: 'page', value: 'post-1', label: 'Pinned Page' }]
    controllerState.comments = [makeAdminComment({ id: '3', name: 'Eve' })]
    controllerState.total = 1
    controllerState.filters = activeFilters
    controllerState.statusCounts = { all: 1, pending: 0, approved: 1, deleteRequested: 0 }
    const html = renderComments(activeFilters)
    // Active-filter body slot rendered (filter bar moved into the body).
    // The field label "文章" for the page filter renders in the pill prefix.
    expect(html).toContain('文章')
    // Row still rendered alongside the active filter.
    expect(html).toContain('Eve')
    // The clear-filters affordance only appears when filters are active.
    expect(html).toContain('清除')
  })

  it('runs the authorItems .unshift branch when the active author filter is not in fetched items', () => {
    queryMocks.query = {
      ...queryMocks.query,
      data: {
        pages: [],
        authors: [{ id: 'u2', name: 'Fetched Author' }],
      },
    }
    const activeFilters: ActiveFilter[] = [{ field: 'author', value: 'u-missing', label: 'Pinned Author' }]
    controllerState.comments = [makeAdminComment({ id: '4', name: 'Frank' })]
    controllerState.total = 1
    controllerState.filters = activeFilters
    controllerState.statusCounts = { all: 1, pending: 0, approved: 1, deleteRequested: 0 }
    const html = renderComments(activeFilters)
    // Author field label "评论人" renders in the pill prefix.
    expect(html).toContain('评论人')
    expect(html).toContain('Frank')
    expect(html).toContain('清除')
  })

  it('renders the load-more sentinel div when hasMore is true', () => {
    controllerState.comments = [makeAdminComment({ id: '5', name: 'Solo' })]
    controllerState.total = 20
    controllerState.statusCounts = { all: 20, pending: 0, approved: 20, deleteRequested: 0 }
    controllerState.hasMore = true
    const html = renderComments()
    expect(html).toContain('Solo')
    // The IntersectionObserver sentinel div is rendered when hasMore is true.
    expect(html).toContain('class="h-1"')
    // The "已加载全部评论" sentinel must NOT appear when hasMore is true.
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
    // The fetching-next-page branch replaces the end-of-list copy.
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
    // Two rows where the child's `rid` points at the parent's id — this
    // forces `parentLookup` (a useMemo over `comments`) to be built
    // and the AdminCommentRow "回复 <parent>" hint branch to render.
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
    // The replied-to hint is rendered for the child row.
    expect(html).toContain('回复')
  })

  it('renders the empty-state branch when comments is empty', () => {
    const html = renderComments()
    expect(html).toContain('暂无评论')
    // The end-of-list sentinel only fires when comments.length > 0.
    expect(html).not.toContain('已加载全部评论')
  })

  it('renders the active-filter body slot instead of the header slot when filters are active', () => {
    const activeFilters: ActiveFilter[] = [{ field: 'status', value: 'pending', label: '待审核' }]
    controllerState.filters = activeFilters
    const html = renderComments(activeFilters)
    // Filter bar still rendered (in the body slot), so the status filter
    // label is visible.
    expect(html).toContain('评论管理')
  })
})
