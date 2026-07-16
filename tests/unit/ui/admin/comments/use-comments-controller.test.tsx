import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import type { CommentBody } from '@/shared/pt/comment-schema'
import type { AdminCommentWire as AdminComment } from '@/shared/types/comments'

import { renderHook } from '#/_helpers/hook'
import {
  DATE_FILTER_OPERATORS,
  DEFAULT_DATE_OPERATOR,
  DEFAULT_TEXT_OPERATOR,
  approveCommentInPages,
  clearDeleteRequestInPages,
  dateFilterLabel,
  isDateFilterOperator,
  isTextFilterOperator,
  parseDateFilter,
  parseTextFilter,
  removeCommentFromPages,
  resolveDateFilterBounds,
  textFilterLabel,
  updateCommentBodyInPages,
  useCommentsController,
  type AdminCommentsData,
  type AdminCommentsPage,
  type DateFilterValue,
  type TextFilterValue,
} from '@/ui/admin/comments/useCommentsController'

// The controller owns a `useInfiniteQuery` + `useQueryClient`, so hook tests
// need a real QueryClient above the memory router that `renderHook` mounts.
// No fetch ever fires — effects do not run under the SSR hook runner.
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

let commentId = 0
function makeAdminComment(overrides: Partial<AdminComment> = {}): AdminComment {
  commentId += 1
  const body: CommentBody = [
    {
      _type: 'block',
      _key: `b${commentId}`,
      children: [{ _type: 'span', _key: `s${commentId}`, text: `Comment ${commentId}` }],
    },
  ]
  return {
    id: String(commentId),
    createAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deleteAt: null,
    deleteRequestedAt: null,
    body,
    type: 'post',
    ownerId: null,
    userId: String(commentId),
    isVerified: false,
    rid: 0,
    isCollapsed: false,
    isPending: false,
    isPinned: false,
    voteUp: 0,
    voteDown: 0,
    rootId: null,
    name: `Author ${commentId}`,
    emailVerified: false,
    link: null,
    badgeName: null,
    badgeColor: null,
    badgeTextColor: null,
    content: `Comment ${commentId}`,
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

function makePage(comments: AdminComment[], overrides: Partial<AdminCommentsPage> = {}): AdminCommentsPage {
  return {
    comments,
    total: comments.length,
    hasMore: false,
    statusCounts: { all: comments.length, pending: 0, approved: comments.length, deleteRequested: 0 },
    ...overrides,
  }
}

function makeData(...pages: AdminCommentsPage[]): AdminCommentsData {
  return { pages, pageParams: pages.map((_, index) => index * 10) }
}

describe('ui/admin/comments/useCommentsController helpers', () => {
  it('validates date operators', () => {
    for (const op of DATE_FILTER_OPERATORS.map((o) => o.value)) {
      expect(isDateFilterOperator(op)).toBe(true)
    }
    expect(isDateFilterOperator('invalid')).toBe(false)
  })

  it('validates text operators', () => {
    expect(isTextFilterOperator('contains')).toBe(true)
    expect(isTextFilterOperator('does-not-contain')).toBe(true)
    expect(isTextFilterOperator('starts-with')).toBe(false)
  })

  it('parses a date filter', () => {
    const value: DateFilterValue = { date: '2024-03-15', op: 'is-greater' }
    expect(parseDateFilter(JSON.stringify(value))).toEqual(value)
  })

  it('rejects malformed date filters', () => {
    expect(parseDateFilter(undefined)).toBeNull()
    expect(parseDateFilter('not-json')).toBeNull()
    expect(parseDateFilter('{}')).toBeNull()
    expect(parseDateFilter('{"date":"2024-01-01","op":"invalid"}')).toBeNull()
  })

  it('labels a date filter', () => {
    const value: DateFilterValue = { date: '2024-03-15', op: 'is-or-less' }
    expect(dateFilterLabel(value)).toBe('不晚于 2024-03-15')
  })

  it('resolves date bounds', () => {
    const value: DateFilterValue = { date: '2024-03-15', op: DEFAULT_DATE_OPERATOR }
    const bounds = resolveDateFilterBounds(value)
    const expectedEnd = new Date('2024-03-15')
    expectedEnd.setHours(23, 59, 59, 999)
    expect(bounds.before).toBe(expectedEnd.toISOString())
    expect(bounds.after).toBeUndefined()
  })

  it('returns empty bounds for invalid dates', () => {
    const bounds = resolveDateFilterBounds({ date: 'not-a-date', op: 'is-less' })
    expect(bounds.after).toBeUndefined()
    expect(bounds.before).toBeUndefined()
  })

  it('parses a text filter', () => {
    const value: TextFilterValue = { op: 'contains', value: 'hello' }
    expect(parseTextFilter(JSON.stringify(value))).toEqual(value)
  })

  it('rejects malformed text filters', () => {
    expect(parseTextFilter(undefined)).toBeNull()
    expect(parseTextFilter('{"op":"bad","value":"x"}')).toBeNull()
  })

  it('labels a text filter', () => {
    expect(textFilterLabel({ op: 'contains', value: 'hello world' })).toBe('包含「hello wo…」')
    expect(textFilterLabel({ op: 'does-not-contain', value: 'x' })).toBe('不包含「x」')
    expect(textFilterLabel({ op: 'contains', value: '   ' })).toBe('包含')
  })
})

describe('ui/admin/comments/useCommentsController page patches', () => {
  it('removes a comment across pages and updates counts, leaving total untouched', () => {
    const pending = makeAdminComment({ isPending: true })
    const approved = makeAdminComment()
    const requested = makeAdminComment({ deleteRequestedAt: '2024-01-02T00:00:00.000Z' })
    const data = makeData(
      makePage([pending, approved], {
        total: 3,
        statusCounts: { all: 3, pending: 1, approved: 1, deleteRequested: 1 },
      }),
      makePage([requested], {
        total: 3,
        statusCounts: { all: 3, pending: 1, approved: 1, deleteRequested: 1 },
      }),
    )

    const afterPending = removeCommentFromPages(data, pending.id)
    expect(afterPending.pages[0]!.comments).toEqual([approved])
    expect(afterPending.pages[0]!.statusCounts).toEqual({ all: 2, pending: 0, approved: 1, deleteRequested: 1 })
    expect(afterPending.pages[0]!.total).toBe(3)

    const afterRequested = removeCommentFromPages(data, requested.id)
    expect(afterRequested.pages[1]!.comments).toEqual([])
    expect(afterRequested.pages[1]!.statusCounts).toEqual({ all: 2, pending: 1, approved: 1, deleteRequested: 0 })
  })

  it('approves a pending comment and moves the count to approved', () => {
    const comment = makeAdminComment({ isPending: true })
    const data = makeData(
      makePage([comment], {
        total: 1,
        statusCounts: { all: 1, pending: 1, approved: 0, deleteRequested: 0 },
      }),
    )
    const next = approveCommentInPages(data, comment.id)
    expect(next.pages[0]!.comments[0]!.isPending).toBe(false)
    expect(next.pages[0]!.statusCounts).toEqual({ all: 1, pending: 0, approved: 1, deleteRequested: 0 })
  })

  it('updates comment content', () => {
    const comment = makeAdminComment()
    const newBody: CommentBody = [
      {
        _type: 'block',
        _key: 'new',
        children: [{ _type: 'span', _key: 'new-s', text: 'Updated body' }],
      },
    ]
    const data = makeData(makePage([comment]))
    const next = updateCommentBodyInPages(data, comment.id, newBody)
    expect(next.pages[0]!.comments[0]!.body).toEqual(newBody)
  })

  it('clears a delete request and moves the count to pending/approved', () => {
    const pending = makeAdminComment({ isPending: true, deleteRequestedAt: '2024-01-02T00:00:00.000Z' })
    const approved = makeAdminComment({ deleteRequestedAt: '2024-01-02T00:00:00.000Z' })
    const data = makeData(
      makePage([pending, approved], {
        total: 2,
        statusCounts: { all: 2, pending: 1, approved: 0, deleteRequested: 1 },
      }),
    )

    const afterPending = clearDeleteRequestInPages(data, pending.id, true)
    expect(afterPending.pages[0]!.comments[0]!.deleteRequestedAt).toBeNull()
    expect(afterPending.pages[0]!.statusCounts).toEqual({ all: 2, pending: 2, approved: 0, deleteRequested: 0 })

    const afterApproved = clearDeleteRequestInPages(data, approved.id, false)
    expect(afterApproved.pages[0]!.comments[1]!.deleteRequestedAt).toBeNull()
    expect(afterApproved.pages[0]!.statusCounts).toEqual({ all: 2, pending: 1, approved: 1, deleteRequested: 0 })
  })
})

describe('ui/admin/comments/useCommentsController hook', () => {
  it('starts with the provided filters and an empty pending list', () => {
    const { filters, filterStatus, comments, total, statusCounts, hasMore, isLoading } = renderHook(
      () => useCommentsController({ initialFilters: [{ field: 'status', value: 'pending', label: '待审' }] }),
      { wrapper: makeWrapper() },
    )
    expect(filters).toHaveLength(1)
    expect(filterStatus).toBe('pending')
    // The list query is pending under SSR — the view renders its skeleton.
    expect(comments).toEqual([])
    expect(total).toBe(0)
    expect(statusCounts).toEqual({ all: 0, pending: 0, approved: 0, deleteRequested: 0 })
    expect(hasMore).toBe(false)
    expect(isLoading).toBe(true)
  })

  it('derives page and author filters', () => {
    const { filterPageKey, filterAuthorId } = renderHook(
      () =>
        useCommentsController({
          initialFilters: [
            { field: 'page', value: 'page-1', label: 'Page' },
            { field: 'author', value: 'user-42', label: 'Author' },
          ],
        }),
      { wrapper: makeWrapper() },
    )
    expect(filterPageKey).toBe('page-1')
    expect(filterAuthorId).toBe('user-42')
  })

  it('parses text and date filters', () => {
    const text: TextFilterValue = { op: 'contains', value: 'hello' }
    const date: DateFilterValue = { date: '2024-03-15', op: 'is-greater' }
    const { filterText, filterDateRange, filterCreatedAfter } = renderHook(
      () =>
        useCommentsController({
          initialFilters: [
            { field: 'text', value: JSON.stringify(text), label: 'Text' },
            { field: 'date', value: JSON.stringify(date), label: 'Date' },
          ],
        }),
      { wrapper: makeWrapper() },
    )
    expect(filterText).toEqual(text)
    expect(filterDateRange).toEqual(date)
    const expectedEnd = new Date('2024-03-15')
    expectedEnd.setHours(23, 59, 59, 999)
    expect(filterCreatedAfter).toBe(expectedEnd.toISOString())
  })

  it('adds and replaces filters', () => {
    const { filters, filterStatus } = renderHook(() => useCommentsController({ initialFilters: [] }), {
      wrapper: makeWrapper(),
      actions: [
        (r) => r.dispatch({ type: 'addFilter', field: 'status', value: 'pending', label: '待审' }),
        (r) => r.dispatch({ type: 'addFilter', field: 'author', value: 'user-1', label: 'Author' }),
        (r) => r.dispatch({ type: 'addFilter', field: 'status', value: 'approved', label: '已通过' }),
      ],
    })
    expect(filters).toHaveLength(2)
    expect(filterStatus).toBe('approved')
  })
})
