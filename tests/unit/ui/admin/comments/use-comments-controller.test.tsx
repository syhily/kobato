import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { ActiveFilter } from '@/ui/admin/shared/filterPillsReducer'

import { makeAdminComment, makeCommentBody } from '#/_helpers/catalog'
import { renderHook } from '#/_helpers/hook'
import { orpcQuery } from '@/client/api/orpc-query'
import {
  type CommentFilterFieldKey,
  COMMENT_FILTER_FIELDS,
  type CommentsFilterQuery,
  isTextFilterOperator,
  parseTextFilter,
  textFilterLabel,
  type TextFilterValue,
} from '@/ui/admin/comments/filter-fields'
import {
  approveCommentInPages,
  clearDeleteRequestInPages,
  removeCommentFromPages,
  updateCommentBodyInPages,
  useCommentsController,
  type AdminCommentsData,
  type AdminCommentsPage,
} from '@/ui/admin/comments/useCommentsController'
import { type SingleDateFilterValue } from '@/ui/admin/shared/date-filter'
import { useFilterPills } from '@/ui/admin/shared/filter-bar/useFilterPills'

// Hook tests need a real QueryClient above the memory router; no fetch ever
// fires (SSR hook runner). The wrapper carries it so cache-level assertions
// reach the same instance the hook saw.
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return Object.assign(
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    },
    { queryClient },
  )
}

// Inert stubs — the confirm/mutation actions are covered by use-comments-actions.test.tsx.
const intents = { edit: () => {}, reply: () => {}, editUser: () => {} }

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
  // Date-filter helper coverage lives in `tests/unit/ui/admin/shared/date-filter.test.ts`.
  it('validates text operators', () => {
    expect(isTextFilterOperator('contains')).toBe(true)
    expect(isTextFilterOperator('does-not-contain')).toBe(true)
    expect(isTextFilterOperator('starts-with')).toBe(false)
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
    const newBody = makeCommentBody('Updated body')
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
  // Composes pill state the same way `CommentsView` does.
  function renderController(
    initial: ActiveFilter<CommentFilterFieldKey>[],
    options: { actions?: Array<(r: { pills: Pills; controller: Controller }) => void> } = {},
  ) {
    return renderHook(
      () => {
        const pills = useFilterPills({ fields: COMMENT_FILTER_FIELDS, initial })
        const controller = useCommentsController({
          filters: pills.filters,
          dispatch: pills.dispatch,
          queryInput: pills.queryInput<CommentsFilterQuery>(),
          intents,
        })
        return { pills, controller }
      },
      { wrapper: makeWrapper(), actions: options.actions },
    )
  }
  type Pills = ReturnType<typeof useFilterPills<CommentFilterFieldKey>>
  type Controller = ReturnType<typeof useCommentsController>

  it('starts with the provided filters and an empty pending list', () => {
    const { pills, controller } = renderController([{ field: 'status', value: 'pending', label: '待审' }])
    expect(pills.filters).toHaveLength(1)
    expect(pills.queryInput<CommentsFilterQuery>().status).toBe('pending')
    // The list query is pending under SSR — the view renders its skeleton.
    expect(controller.comments).toEqual([])
    expect(controller.total).toBe(0)
    expect(controller.statusCounts).toEqual({ all: 0, pending: 0, approved: 0, deleteRequested: 0 })
    expect(controller.hasMore).toBe(false)
    expect(controller.isLoading).toBe(true)
  })

  it('derives the page and author query input from the pills', () => {
    const { pills } = renderController([
      { field: 'page', value: 'page-1', label: 'Page' },
      { field: 'author', value: 'user-42', label: 'Author' },
    ])
    expect(pills.queryInput<CommentsFilterQuery>()).toEqual({ pageKey: 'page-1', userId: 'user-42' })
  })

  it('parses text and date filters through the typed accessors', () => {
    const text: TextFilterValue = { op: 'contains', value: 'hello' }
    const date: SingleDateFilterValue = { date: '2024-03-15', op: 'is-greater' }
    const { pills } = renderController([
      { field: 'text', value: JSON.stringify(text), label: 'Text' },
      { field: 'date', value: JSON.stringify(date), label: 'Date' },
    ])
    expect(pills.text('text')).toEqual(text)
    expect(pills.dateSingle('date')).toEqual(date)
    const expectedEnd = new Date('2024-03-15')
    expectedEnd.setHours(23, 59, 59, 999)
    expect(pills.queryInput<CommentsFilterQuery>().createdAfter).toBe(expectedEnd.toISOString())
  })

  it('adds and replaces filters', () => {
    const { pills } = renderController([], {
      actions: [
        (r) => r.pills.dispatch({ type: 'addFilter', field: 'status', value: 'pending', label: '待审' }),
        (r) => r.pills.dispatch({ type: 'addFilter', field: 'author', value: 'user-1', label: 'Author' }),
        (r) => r.pills.dispatch({ type: 'addFilter', field: 'status', value: 'approved', label: '已通过' }),
      ],
    })
    expect(pills.filters).toHaveLength(2)
    expect(pills.queryInput<CommentsFilterQuery>().status).toBe('approved')
  })

  it('invalidateList invalidates the cached loadAll pages for the active filter input', () => {
    const wrapper = makeWrapper()
    // Seed the exact no-filter key: `input: { offset: 0, limit: 10 }` (PAGE_SIZE).
    const listKey = orpcQuery.admin.comments.loadAll.infiniteOptions({
      input: (pageParam: number) => ({ offset: pageParam, limit: 10 }),
      initialPageParam: 0,
      // Not part of the key — required by the options builder's type.
      getNextPageParam: () => undefined,
    }).queryKey
    wrapper.queryClient.setQueryData(listKey, makeData(makePage([])))
    const controller = renderHook(
      () => {
        const pills = useFilterPills({ fields: COMMENT_FILTER_FIELDS, initial: [] })
        return useCommentsController({
          filters: pills.filters,
          dispatch: pills.dispatch,
          queryInput: pills.queryInput<CommentsFilterQuery>(),
          intents,
        })
      },
      { wrapper },
    )

    controller.invalidateList()

    expect(wrapper.queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
  })
})
