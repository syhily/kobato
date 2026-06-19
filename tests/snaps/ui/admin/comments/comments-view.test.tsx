import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminCommentWire as AdminComment } from '@/shared/types/comments'
import type { CommentsState } from '@/ui/admin/comments/useCommentsController'

import { inklingParagraph } from '#/_helpers/inkling'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { AdminCommentRow } from '@/ui/admin/comments/AdminCommentRow'
import { CommentsView } from '@/ui/admin/comments/CommentsView'
import { DateFilterEditor, formatDateInput, parseDateInput } from '@/ui/admin/comments/DateFilterEditor'
import { EditUserDialog } from '@/ui/admin/comments/EditUserDialog'
import { TextFilterEditor } from '@/ui/admin/comments/TextFilterEditor'

// Silence the harmless "IntersectionObserver is not defined" warning that
// the CommentsView effect logs under SSR — it is expected in this
// environment and not something the snapshot should fail on.
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

// --- data-loaded CommentsView mocks -----------------------------------------
//
// `CommentsView` does not pull its comment list from react-query — it
// drives a `useReducer` (`useCommentsController`) whose `loaded` action
// is only dispatched from a `useEffect` that calls `orpc.admin.comments.
// loadAll`. Effects never run during synchronous SSR, so the reducer
// stays at its initial empty state and only the skeleton chrome renders.
// To cover the data-loaded render path (the `state.comments.map` branch
// and the empty-state branch) we stub the controller with a hoisted
// singleton, mirroring exactly what `tags.test.tsx` /
// `musics-view.test.tsx` do for their own controllers.

const controllerState = vi.hoisted(() => ({
  state: {
    comments: [] as AdminComment[],
    total: 0,
    filters: [],
    statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
  } as CommentsState,
  hasMore: false,
}))

vi.mock('@/ui/admin/comments/useCommentsController', async () => {
  const actual = await vi.importActual<typeof import('@/ui/admin/comments/useCommentsController')>(
    '@/ui/admin/comments/useCommentsController',
  )
  return {
    ...actual,
    useCommentsController: () => ({
      state: controllerState.state,
      dispatch: vi.fn(),
      pageSize: 10,
      hasMore: controllerState.hasMore,
      filterStatus: 'all',
      filterPageKey: '',
      filterAuthorId: '',
      filterText: null,
      filterDateRange: null,
      filterCreatedAfter: undefined,
      filterCreatedBefore: undefined,
    }),
  }
})

// The filter chrome still calls react-query for the page/author
// autocomplete lookups — stub the query hooks with inert defaults so
// the chrome renders without issuing network calls.

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

// --- Fixtures ----------------------------------------------------------------

let commentSeq = 0

function makeAdminComment(overrides: Partial<AdminComment> = {}): AdminComment {
  commentSeq += 1
  const body = inklingParagraph(`Comment body ${commentSeq}`)
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

// The admin comment row takes a bag of callbacks; for SSR we only need them
// to be present and callable, so a single no-op stub is enough.
const noop = () => {}
const rowProps = {
  parentLookup: new Map<string, AdminComment>(),
  onEdit: noop,
  onReply: noop,
  onEditUser: noop,
  onApproved: noop,
  onDeleted: noop,
  onDeleteRequestResolved: noop,
  onConfirmApprove: noop,
  onConfirmDelete: noop,
  onConfirmApproveDeletion: noop,
  onConfirmRejectDeletion: noop,
  onFilterByPage: noop,
  onFilterByAuthor: noop,
}

// --- 1. CommentsView (data-fetching view) ------------------------------------

describe('snapshot: CommentsView', () => {
  beforeEach(() => {
    // Reset the hoisted controller state between cases so each test
    // controls which branch of the view it covers.
    controllerState.state = {
      comments: [],
      total: 0,
      filters: [],
      statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
    }
    controllerState.hasMore = false
  })

  // Regression guard: the page chrome + skeleton render even before the
  // first dispatch resolves.
  it('renders the page chrome with title and loading skeleton', () => {
    const html = stableHtml(
      renderInRouter(
        <CommentsView currentUserName="Alice" currentUserEmail="a@b.com" initialFilters={[]} />,
        '/admin/comments',
      ),
    )
    expect(html).toContain('评论管理')
    expect(html).toContain('审核、回复、编辑站点评论')
    expect(html.length).toBeGreaterThan(0)
  })

  it('renders the data-loaded branch with comment rows and filter chrome', () => {
    controllerState.state = {
      comments: [
        makeAdminComment({
          id: '1',
          name: 'Alice',
          pageTitle: 'Hello World',
          pagePermalink: '/posts/hello',
          badgeName: '站长',
          badgeColor: '#008c95',
          badgeTextColor: '#ffffff',
        }),
        makeAdminComment({
          id: '2',
          name: 'Bob',
          isPending: true,
          pageTitle: 'Second Post',
          pagePermalink: '/posts/second',
        }),
      ],
      total: 2,
      filters: [],
      statusCounts: { all: 2, pending: 1, approved: 1, deleteRequested: 0 },
    }
    const html = stableHtml(
      renderInRouter(
        <CommentsView currentUserName="Alice" currentUserEmail="a@b.com" initialFilters={[]} />,
        '/admin/comments',
      ),
    )
    // Header chrome still rendered.
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
    controllerState.state = {
      comments: [],
      total: 0,
      filters: [],
      statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
    }
    const html = stableHtml(
      renderInRouter(
        <CommentsView currentUserName="Alice" currentUserEmail="a@b.com" initialFilters={[]} />,
        '/admin/comments',
      ),
    )
    expect(html).toContain('评论管理')
    // Empty-state branch takes over from the row map.
    expect(html).toContain('暂无评论')
    // The "已加载全部评论" sentinel only fires when comments.length > 0.
    expect(html).not.toContain('已加载全部评论')
  })

  it('renders the loading-more sentinel when hasMore is true', () => {
    controllerState.state = {
      comments: [makeAdminComment({ id: '9', name: 'Solo' })],
      total: 20,
      filters: [],
      statusCounts: { all: 20, pending: 0, approved: 20, deleteRequested: 0 },
    }
    controllerState.hasMore = true
    const html = stableHtml(
      renderInRouter(
        <CommentsView currentUserName="Alice" currentUserEmail="a@b.com" initialFilters={[]} />,
        '/admin/comments',
      ),
    )
    expect(html).toContain('Solo')
    // The intersection sentinel div is present when hasMore is true.
    expect(html).toContain('class="h-1"')
  })
})

// --- 2. AdminCommentRow (props-driven) ---------------------------------------

describe('snapshot: AdminCommentRow', () => {
  it('renders an approved comment with author, body and actions', () => {
    const comment = makeAdminComment({
      name: 'Alice',
      pageTitle: 'Hello World',
      pagePermalink: '/posts/hello',
      badgeName: '站长',
      badgeColor: '#008c95',
      badgeTextColor: '#ffffff',
    })
    const html = stableHtml(renderInRouter(<AdminCommentRow comment={comment} {...rowProps} />))
    expect(html).toContain('data-slot="admin-comment-row"')
    expect(html).toContain('Alice')
    expect(html).toContain('Comment body')
    // Status badge for a non-pending, non-delete-requested comment.
    expect(html).toContain('已审核')
    // Author badge text.
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

// --- 3. DateFilterEditor (+ pure helpers) ------------------------------------

describe('DateFilterEditor helpers', () => {
  it('parseDateInput returns undefined for empty input', () => {
    expect(parseDateInput('')).toBeUndefined()
  })

  it('parseDateInput returns undefined for malformed input', () => {
    expect(parseDateInput('not-a-date')).toBeUndefined()
    expect(parseDateInput('2024-13-40')).toBeUndefined()
    expect(parseDateInput('2024/03/12')).toBeUndefined()
  })

  it('parseDateInput parses a valid yyyy-mm-dd string', () => {
    const parsed = parseDateInput('2024-03-12')
    expect(parsed).toBeInstanceOf(Date)
    expect(parsed!.getFullYear()).toBe(2024)
    expect(parsed!.getMonth()).toBe(2) // March
    expect(parsed!.getDate()).toBe(12)
  })

  it('formatDateInput round-trips a parsed date', () => {
    const iso = '2024-03-12'
    expect(formatDateInput(parseDateInput(iso)!)).toBe(iso)
  })
})

describe('snapshot: DateFilterEditor', () => {
  it('renders the date input with placeholder and current operator', () => {
    const html = stableHtml(
      renderInRouter(<DateFilterEditor value={{ date: '2024-03-12', op: 'is-or-less' }} onChange={() => {}} />),
    )
    expect(html).toContain('placeholder="YYYY-MM-DD"')
    expect(html).toContain('aria-label="日期"')
    expect(html).toContain('aria-label="打开日历"')
    // The committed value should appear as the input value.
    expect(html).toContain('value="2024-03-12"')
  })

  it('renders with no initial value', () => {
    const html = stableHtml(renderInRouter(<DateFilterEditor value={null} onChange={() => {}} />))
    expect(html).toContain('placeholder="YYYY-MM-DD"')
  })
})

// --- 4. TextFilterEditor -----------------------------------------------------

describe('snapshot: TextFilterEditor', () => {
  it('renders the text input with placeholder and the operator trigger', () => {
    const html = stableHtml(
      renderInRouter(<TextFilterEditor value={{ op: 'contains', value: 'hello' }} onChange={() => {}} />),
    )
    expect(html).toContain('aria-label="搜索评论内容"')
    expect(html).toContain('placeholder="搜索评论内容…"')
    expect(html).toContain('value="hello"')
    // With more than one default operator the trigger is shown; its label
    // comes from TEXT_FILTER_OPERATORS.
    expect(html).toContain('包含')
  })

  it('hides the operator trigger when only one operator is supplied', () => {
    const html = stableHtml(
      renderInRouter(
        <TextFilterEditor
          value={{ op: 'contains', value: '' }}
          onChange={() => {}}
          operators={[{ value: 'contains', label: '包含' }]}
        />,
      ),
    )
    // The search input is still present, but the operator dropdown label
    // text (which would otherwise be the trigger's visible content) is
    // not emitted as a standalone text node — there is no trigger at all.
    expect(html).toContain('aria-label="搜索评论内容"')
    // Single operator → no dropdown trigger markup. The single operator's
    // label is NOT rendered because the trigger is conditionally hidden.
    expect(html).not.toMatch(/<button[^>]*>\s*包含/u)
  })
})

// --- 5. EditUserDialog -------------------------------------------------------

describe('snapshot: EditUserDialog', () => {
  // The Dialog uses Base UI under the hood. When `comment` is null the
  // dialog is closed and renders nothing visible; we assert that and the
  // fact that the render itself does not throw.
  it('renders nothing user-visible in the closed state', () => {
    const html = stableHtml(renderInRouter(<EditUserDialog comment={null} onClose={() => {}} onSaved={() => {}} />))
    // Closed dialog should not surface the form chrome.
    expect(html).not.toContain('编辑评论用户')
  })

  // The open dialog mounts via a portal/layer that Base UI does not emit
  // during synchronous SSR, so we cannot assert on the form fields here.
  // Integration tests cover the opened UX. We keep the render call so a
  // regression that synchronously throws is still caught.
  it('does not throw when rendered with an open comment target', () => {
    const comment = makeAdminComment({ name: 'Alice', email: 'alice@example.com' })
    expect(() =>
      renderInRouter(<EditUserDialog comment={comment} onClose={() => {}} onSaved={() => {}} />),
    ).not.toThrow()
  })
})
