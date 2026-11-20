// @vitest-environment happy-dom

import type { ReactElement, ReactNode } from 'react'

import { wrapWithI18n } from '@kobato/web-admin/tests/utils/i18n-render.tsx'
import { tZhCN } from '@kobato/web-admin/tests/utils/i18n.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render as rtlRender } from '@testing-library/react'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider, useSearchParams } from 'react-router'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  loadAll: vi.fn(),
  approve: vi.fn(),
  deleteComment: vi.fn(),
  approveCommentDeletion: vi.fn(),
  searchPages: vi.fn(),
  searchAuthors: vi.fn(),
}))

const apiClientMod = await import('@kobato/web-client/api/client.ts')
vi.spyOn(apiClientMod, 'orpc', 'get').mockImplementation(
  () =>
    ({
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
    }) as never,
)

afterAll(() => {
  vi.restoreAllMocks()
})

const { buildCommentFilterFields } = await import('@kobato/web-admin/ui/comments/filter-fields.ts')
const { parseCommentFiltersFromSearchParams, useCommentsController } =
  await import('@kobato/web-admin/ui/comments/use-comments-controller.ts')
const { useFilterPills } = await import('@kobato/web-admin/ui/shared/filter-bar/use-filter-pills.ts')

const COMMENT_FILTER_FIELDS = buildCommentFilterFields(tZhCN)

import type { CommentFilterFieldKey } from '@kobato/web-admin/ui/comments/filter-fields.ts'

type Pills = ReturnType<typeof useFilterPills<CommentFilterFieldKey>>
type Controller = ReturnType<typeof useCommentsController>
type Sink = { current: { pills: Pills; controller: Controller } | null }

function Harness({ sink }: { sink: Sink }) {
  const [searchParams] = useSearchParams()
  const [initial] = useState(() => parseCommentFiltersFromSearchParams(searchParams, tZhCN))
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
  const render = (ui: ReactElement) =>
    rtlRender(ui, { wrapper: ({ children }: { children: ReactNode }) => wrapWithI18n(children) })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, sink }
}

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
    await act(async () => {
      await router.navigate('/comments')
    })

    act(() => {
      sink.current!.pills.dispatch({ type: 'addFilter', field: 'status', value: 'pending', label: '待审核' })
    })
    await settleUrlSync()
    expect(router.state.location.search).toBe('?status=pending')

    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.search).toBe('')
    expect(sink.current!.pills.filters).toEqual([])
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
    await settleUrlSync()
    expect(router.state.location.search).toBe('?status=approved')
    expect(sink.current!.pills.filters).toHaveLength(1)
  })
})
