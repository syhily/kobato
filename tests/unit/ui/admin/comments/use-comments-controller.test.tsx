import { describe, expect, it } from 'vitest'

import type { AdminCommentWire as AdminComment } from '@/shared/types/comments'

import { renderHook } from '#/_helpers/hook'
import { inklingParagraph } from '#/_helpers/inkling'
import {
  DATE_FILTER_OPERATORS,
  DEFAULT_DATE_OPERATOR,
  DEFAULT_TEXT_OPERATOR,
  type DateFilterValue,
  type TextFilterValue,
  dateFilterLabel,
  isDateFilterOperator,
  isTextFilterOperator,
  parseDateFilter,
  parseTextFilter,
  resolveDateFilterBounds,
  textFilterLabel,
  useCommentsController,
} from '@/ui/admin/comments/useCommentsController'

let commentId = 0
function makeAdminComment(overrides: Partial<AdminComment> = {}): AdminComment {
  commentId += 1
  const body = inklingParagraph(`Comment ${commentId}`)
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

describe('ui/admin/comments/useCommentsController hook', () => {
  it('starts with the provided filters', () => {
    const { state, filterStatus } = renderHook(() =>
      useCommentsController({ initialFilters: [{ field: 'status', value: 'pending', label: '待审' }] }),
    )
    expect(state.filters).toHaveLength(1)
    expect(filterStatus).toBe('pending')
    expect(state.total).toBe(0)
    expect(state.statusCounts).toEqual({ all: 0, pending: 0, approved: 0, deleteRequested: 0 })
  })

  it('derives page and author filters', () => {
    const { filterPageKey, filterAuthorId } = renderHook(() =>
      useCommentsController({
        initialFilters: [
          { field: 'page', value: 'page-1', label: 'Page' },
          { field: 'author', value: 'user-42', label: 'Author' },
        ],
      }),
    )
    expect(filterPageKey).toBe('page-1')
    expect(filterAuthorId).toBe('user-42')
  })

  it('parses text and date filters', () => {
    const text: TextFilterValue = { op: 'contains', value: 'hello' }
    const date: DateFilterValue = { date: '2024-03-15', op: 'is-greater' }
    const { filterText, filterDateRange, filterCreatedAfter } = renderHook(() =>
      useCommentsController({
        initialFilters: [
          { field: 'text', value: JSON.stringify(text), label: 'Text' },
          { field: 'date', value: JSON.stringify(date), label: 'Date' },
        ],
      }),
    )
    expect(filterText).toEqual(text)
    expect(filterDateRange).toEqual(date)
    const expectedEnd = new Date('2024-03-15')
    expectedEnd.setHours(23, 59, 59, 999)
    expect(filterCreatedAfter).toBe(expectedEnd.toISOString())
  })

  it('loads comments and status counts', () => {
    const comments = [makeAdminComment(), makeAdminComment()]
    const statusCounts = { all: 2, pending: 1, approved: 1, deleteRequested: 0 }
    const { state } = renderHook(() => useCommentsController({ initialFilters: [] }), {
      actions: [(r) => r.dispatch({ type: 'loaded', comments, total: 2, statusCounts })],
    })
    expect(state.comments).toEqual(comments)
    expect(state.total).toBe(2)
    expect(state.statusCounts).toEqual(statusCounts)
  })

  it('appends comments', () => {
    const first = makeAdminComment()
    const second = makeAdminComment()
    const { state } = renderHook(() => useCommentsController({ initialFilters: [] }), {
      actions: [
        (r) =>
          r.dispatch({
            type: 'loaded',
            comments: [first],
            total: 2,
            statusCounts: { all: 2, pending: 0, approved: 2, deleteRequested: 0 },
          }),
        (r) => r.dispatch({ type: 'appended', comments: [second], total: 2 }),
      ],
    })
    expect(state.comments).toEqual([first, second])
    expect(state.total).toBe(2)
  })

  it('approves a pending comment and updates counts', () => {
    const comment = makeAdminComment({ isPending: true })
    const { state } = renderHook(() => useCommentsController({ initialFilters: [] }), {
      actions: [
        (r) =>
          r.dispatch({
            type: 'loaded',
            comments: [comment],
            total: 1,
            statusCounts: { all: 1, pending: 1, approved: 0, deleteRequested: 0 },
          }),
        (r) => r.dispatch({ type: 'approveComment', id: comment.id }),
      ],
    })
    expect(state.comments[0]!.isPending).toBe(false)
    expect(state.statusCounts).toEqual({ all: 1, pending: 0, approved: 1, deleteRequested: 0 })
  })

  it('removes a comment and updates counts', () => {
    const pending = makeAdminComment({ isPending: true })
    const approved = makeAdminComment()
    const requested = makeAdminComment({ deleteRequestedAt: '2024-01-02T00:00:00.000Z' })
    const { state } = renderHook(() => useCommentsController({ initialFilters: [] }), {
      actions: [
        (r) =>
          r.dispatch({
            type: 'loaded',
            comments: [pending, approved, requested],
            total: 3,
            statusCounts: { all: 3, pending: 1, approved: 1, deleteRequested: 1 },
          }),
        (r) => r.dispatch({ type: 'removeComment', id: pending.id }),
        (r) => r.dispatch({ type: 'removeComment', id: approved.id }),
        (r) => r.dispatch({ type: 'removeComment', id: requested.id }),
      ],
    })
    expect(state.comments).toHaveLength(0)
    expect(state.statusCounts).toEqual({ all: 0, pending: 0, approved: 0, deleteRequested: 0 })
    expect(state.total).toBe(3)
  })

  it('updates comment content', () => {
    const comment = makeAdminComment()
    const newBody = inklingParagraph('Updated body')
    const { state } = renderHook(() => useCommentsController({ initialFilters: [] }), {
      actions: [
        (r) =>
          r.dispatch({
            type: 'loaded',
            comments: [comment],
            total: 1,
            statusCounts: { all: 1, pending: 0, approved: 1, deleteRequested: 0 },
          }),
        (r) => r.dispatch({ type: 'updateCommentContent', id: comment.id, body: newBody }),
      ],
    })
    expect(state.comments[0]!.body).toEqual(newBody)
  })

  it('adds and replaces filters', () => {
    const { state, filterStatus } = renderHook(() => useCommentsController({ initialFilters: [] }), {
      actions: [
        (r) => r.dispatch({ type: 'addFilter', field: 'status', value: 'pending', label: '待审' }),
        (r) => r.dispatch({ type: 'addFilter', field: 'author', value: 'user-1', label: 'Author' }),
        (r) => r.dispatch({ type: 'addFilter', field: 'status', value: 'approved', label: '已通过' }),
      ],
    })
    expect(state.filters).toHaveLength(2)
    expect(filterStatus).toBe('approved')
  })

  it('removes a filter', () => {
    const { state, filterStatus } = renderHook(
      () =>
        useCommentsController({
          initialFilters: [{ field: 'status', value: 'pending', label: '待审' }],
        }),
      {
        actions: [(r) => r.dispatch({ type: 'removeFilter', field: 'status' })],
      },
    )
    expect(state.filters).toHaveLength(0)
    expect(filterStatus).toBe('all')
  })

  it('renames a filter label', () => {
    const { state } = renderHook(
      () =>
        useCommentsController({
          initialFilters: [{ field: 'status', value: 'pending', label: '待审' }],
        }),
      {
        actions: [(r) => r.dispatch({ type: 'renameFilter', field: 'status', label: '待审核' })],
      },
    )
    expect(state.filters[0]!.label).toBe('待审核')
  })

  it('clears all filters', () => {
    const { state } = renderHook(
      () =>
        useCommentsController({
          initialFilters: [
            { field: 'status', value: 'pending', label: '待审' },
            { field: 'page', value: 'p1', label: 'Page' },
          ],
        }),
      {
        actions: [(r) => r.dispatch({ type: 'clearFilters' })],
      },
    )
    expect(state.filters).toHaveLength(0)
  })

  it('clears a delete request and moves to pending/approved', () => {
    const pending = makeAdminComment({
      isPending: true,
      deleteRequestedAt: '2024-01-02T00:00:00.000Z',
    })
    const approved = makeAdminComment({
      deleteRequestedAt: '2024-01-02T00:00:00.000Z',
    })
    const { state } = renderHook(() => useCommentsController({ initialFilters: [] }), {
      actions: [
        (r) =>
          r.dispatch({
            type: 'loaded',
            comments: [pending, approved],
            total: 2,
            statusCounts: { all: 2, pending: 1, approved: 0, deleteRequested: 1 },
          }),
        (r) => r.dispatch({ type: 'clearDeleteRequest', id: pending.id, isPending: true }),
        (r) => r.dispatch({ type: 'clearDeleteRequest', id: approved.id, isPending: false }),
      ],
    })
    expect(state.comments[0]!.deleteRequestedAt).toBeNull()
    expect(state.comments[1]!.deleteRequestedAt).toBeNull()
    expect(state.statusCounts).toEqual({ all: 2, pending: 2, approved: 1, deleteRequested: 0 })
  })
})
