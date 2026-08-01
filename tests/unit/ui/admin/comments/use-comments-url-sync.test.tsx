// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider, useSearchParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The controller's list query and the pills' autocomplete queries hit the
// oRPC client; mocked at the same seam use-comments-actions.test.tsx uses.
const api = vi.hoisted(() => ({
  loadAll: vi.fn(),
  approve: vi.fn(),
  deleteComment: vi.fn(),
  approveCommentDeletion: vi.fn(),
  searchPages: vi.fn(),
  searchAuthors: vi.fn(),
}))

vi.mock('@/client/api/client', () => ({
  orpc: {
    admin: {
      comments: {
        loadAll: (input: unknown) => api.loadAll(input),
        approve: (input: unknown) => api.approve(input),
        delete: (input: unknown) => api.deleteComment(input),
        approveCommentDeletion: (input: unknown) => api.approveCommentDeletion(input),
        searchPages: (input: unknown) => api.searchPages(input),
        searchAuthors: (input: unknown) => api.searchAuthors(input),
      },
    },
  },
}))

import { COMMENT_FILTER_FIELDS, type CommentFilterFieldKey } from '@/ui/admin/comments/filter-fields'
import { parseCommentFiltersFromSearchParams, useCommentsController } from '@/ui/admin/comments/useCommentsController'
import { useFilterPills } from '@/ui/admin/shared/filter-bar/useFilterPills'

type Pills = ReturnType<typeof useFilterPills<CommentFilterFieldKey>>
type Controller = ReturnType<typeof useCommentsController>
type Sink = { current: { pills: Pills; controller: Controller } | null }

// Renders the pills + controller exactly the way CommentsView wires them,
// inside a real memory router so Back/Forward navigations are drivable.
// The latest render's hook results are parked on `sink` for assertions.
function Harness({ sink }: { sink: Sink }) {
  // Mirror the route's mount seed: parse the shared URL once per mount.
  const [searchParams] = useSearchParams()
  const [initial] = useState(() => parseCommentFiltersFromSearchParams(searchParams))
  const pills = useFilterPills({ fields: COMMENT_FILTER_FIELDS, initial })
  const controller = useCommentsController({
    filters: pills.filters,
    dispatch: pills.dispatch,
    queryInput: pills.queryInput(),
    intents: { edit: () => {}, reply: () => {}, editUser: () => {} },
  })
  sink.current = { pills, controller }
  return null
}

function setup(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const sink: Sink = { current: null }
  const router = createMemoryRouter([{ path: '*', element: <Harness sink={sink} /> }], {
    initialEntries: [initialPath],
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, sink }
}

// Let the 300ms URL-sync debounce fire (and any stale timer with it) on
// the fake clock — no real-time wait.
const settleUrlSync = () => act(async () => vi.advanceTimersByTimeAsync(400))

beforeEach(() => {
  vi.useFakeTimers()
  api.loadAll.mockReset()
  api.loadAll.mockResolvedValue({
    comments: [],
    total: 0,
    hasMore: false,
    statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
  })
  api.searchPages.mockReset()
  api.searchPages.mockResolvedValue({ pages: [] })
  api.searchAuthors.mockReset()
  api.searchAuthors.mockResolvedValue({ authors: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCommentsController URL sync', () => {
  it('Back restores the previous filters and the debounced write-back does not overwrite the popped URL', async () => {
    const { router, sink } = setup('/comments')
    // Push the same route so Back has an entry to pop to.
    await act(async () => {
      await router.navigate('/comments')
    })

    act(() => {
      sink.current!.pills.dispatch({ type: 'addFilter', field: 'status', value: 'pending', label: '待审核' })
    })
    // The debounced write-back mirrors the pill into the URL.
    await settleUrlSync()
    expect(router.state.location.search).toBe('?status=pending')

    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.search).toBe('')
    // The pills reseed from the restored URL…
    expect(sink.current!.pills.filters).toEqual([])
    // …and the stale write-back leaves the popped URL alone.
    await settleUrlSync()
    expect(router.state.location.search).toBe('')
  })

  it('Back to a filtered entry reseeds those filters without rewriting the URL', async () => {
    const { router, sink } = setup('/comments')

    act(() => {
      sink.current!.pills.dispatch({ type: 'addFilter', field: 'status', value: 'pending', label: '待审核' })
    })
    await settleUrlSync()
    expect(router.state.location.search).toBe('?status=pending')

    // Push forward and filter differently, then pop back to the first entry.
    await act(async () => {
      await router.navigate('/comments')
    })
    act(() => {
      sink.current!.pills.dispatch({ type: 'addFilter', field: 'status', value: 'approved', label: '已审核' })
    })
    await settleUrlSync()
    expect(router.state.location.search).toBe('?status=approved')

    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.search).toBe('?status=pending')
    expect(sink.current!.pills.filters).toEqual([{ field: 'status', value: 'pending', label: '待审核' }])
    await settleUrlSync()
    expect(router.state.location.search).toBe('?status=pending')
  })

  it('keeps the URL-seeded filters from a shared link (mount seeding preserved)', async () => {
    const { router, sink } = setup('/comments?status=approved')
    expect(sink.current!.pills.filters).toEqual([{ field: 'status', value: 'approved', label: '已审核' }])
    // The write-back round-trips the same params — the shared URL stays put.
    await settleUrlSync()
    expect(router.state.location.search).toBe('?status=approved')
    expect(sink.current!.pills.filters).toHaveLength(1)
  })
})
