// @vitest-environment happy-dom

import type { ReactNode } from 'react'

import { useAdminInfiniteList } from '@kobato/ui/admin/shared/useAdminInfiniteList'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

interface TestRow {
  id: string
}

interface TestPage {
  rows: TestRow[]
  total: number
  hasMore: boolean
}

interface TestInput {
  offset: number
  limit: number
}

// Minimal structural stand-in for an oRPC procedure's TanStack utils: builds
// real useInfiniteQuery options around an injected page fetcher, the same
// way `orpcQuery.*.list.infiniteOptions` does. No network ever fires — the
// fetcher resolves in-memory pages.
function makeNamespace<TPage>(fetchPage: (input: TestInput) => Promise<TPage>) {
  return {
    key: () => ['test', 'admin-infinite-list'],
    infiniteOptions(options: {
      input: (pageParam: number) => TestInput
      initialPageParam: number
      getNextPageParam: (lastPage: TPage, allPages: TPage[], lastPageParam: number) => number | undefined
      enabled?: boolean
    }) {
      return {
        queryKey: ['test', 'admin-infinite-list'] as const,
        queryFn: ({ pageParam }: { pageParam: number }) => fetchPage(options.input(pageParam)),
        initialPageParam: options.initialPageParam,
        getNextPageParam: options.getNextPageParam,
        enabled: options.enabled,
      }
    },
  }
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return Object.assign(
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    },
    { queryClient },
  )
}

// Page fetcher serving `total` rows in `pageSize` chunks, recording every
// input it was called with.
function makePager(total: number) {
  const fetched: TestInput[] = []
  const fetchPage = vi.fn((input: TestInput) => {
    fetched.push(input)
    const rows: TestRow[] = []
    for (let n = input.offset; n < Math.min(input.offset + input.limit, total); n += 1) {
      rows.push({ id: `r${n}` })
    }
    return Promise.resolve<TestPage>({ rows, total, hasMore: input.offset + input.limit < total })
  })
  return { fetched, fetchPage }
}

function renderList({ pageSize, fetchPage }: { pageSize: number; fetchPage: (input: TestInput) => Promise<TestPage> }) {
  return renderHook(
    () =>
      useAdminInfiniteList({
        namespace: makeNamespace(fetchPage),
        pageSize,
        buildInput: (offset) => ({ offset, limit: pageSize }),
        selectRows: (page) => page.rows,
        noun: '项目',
      }),
    { wrapper: makeWrapper() },
  )
}

function rowIds(result: { current: { rows: TestRow[] } }): string[] {
  return result.current.rows.map((row) => row.id)
}

describe('ui/admin/shared/useAdminInfiniteList', () => {
  it('advances the offset by pageSize across pages and flattens rows', async () => {
    const { fetched, fetchPage } = makePager(5)
    const { result } = renderList({ pageSize: 2, fetchPage })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(rowIds(result)).toEqual(['r0', 'r1'])
    expect(result.current.total).toBe(5)
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(rowIds(result)).toEqual(['r0', 'r1', 'r2', 'r3']))
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(rowIds(result)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']))
    expect(fetched.map((input) => input.offset)).toEqual([0, 2, 4])
  })

  it('stops paging once the last page reports hasMore false', async () => {
    const { fetched, fetchPage } = makePager(5)
    const { result } = renderList({ pageSize: 2, fetchPage })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.hasNextPage).toBe(false))

    // A trailing fetchNextPage is a no-op — no fourth request fires.
    await act(async () => {
      await result.current.fetchNextPage()
    })
    expect(fetched).toHaveLength(3)
    expect(rowIds(result)).toHaveLength(5)
  })

  it('derives the next offset from a dynamic pageSize', async () => {
    const { fetched, fetchPage } = makePager(60)
    const { result } = renderList({ pageSize: 25, fetchPage })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.rows).toHaveLength(60))

    expect(fetched.map((input) => input.offset)).toEqual([0, 25, 50])
    expect(result.current.hasNextPage).toBe(false)
  })

  it('handles an empty first page', async () => {
    const { fetchPage } = makePager(0)
    const { result } = renderList({ pageSize: 10, fetchPage })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rows).toEqual([])
    expect(result.current.total).toBe(0)
    expect(result.current.hasNextPage).toBe(false)
  })

  it('holds the query idle while enabled is false', async () => {
    const { fetchPage } = makePager(3)
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAdminInfiniteList({
          namespace: makeNamespace(fetchPage),
          pageSize: 2,
          buildInput: (offset) => ({ offset, limit: 2 }),
          selectRows: (page) => page.rows,
          noun: '项目',
          enabled,
        }),
      { wrapper: makeWrapper(), initialProps: { enabled: false } },
    )

    // Idle: pending but not fetching, and no request ever fired.
    expect(result.current.isLoading).toBe(false)
    expect(fetchPage).not.toHaveBeenCalled()

    rerender({ enabled: true })
    await waitFor(() => expect(rowIds(result)).toEqual(['r0', 'r1']))
  })

  it('derives a 0 total for pages without a count aggregate', async () => {
    // Endpoints like the meting music search report only `hasMore`.
    const fetchPage = vi.fn((input: TestInput) =>
      Promise.resolve({ rows: [{ id: 'r0' }], hasMore: input.offset + input.limit < 1 }),
    )
    const { result } = renderHook(
      () =>
        useAdminInfiniteList({
          namespace: makeNamespace(fetchPage),
          pageSize: 2,
          buildInput: (offset) => ({ offset, limit: 2 }),
          selectRows: (page) => page.rows,
          noun: '项目',
        }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(rowIds(result)).toEqual(['r0'])
    expect(result.current.total).toBe(0)
  })

  it('patchPages rewrites the cached pages in place', async () => {
    const { fetchPage } = makePager(4)
    const { result } = renderList({ pageSize: 2, fetchPage })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(rowIds(result)).toEqual(['r0', 'r1'])

    // The observer notification rides the notifyManager scheduler, so the
    // re-render lands a tick after the `setQueryData` call — poll for it.
    await act(async () => {
      result.current.patchPages((data) => ({
        ...data,
        pages: data.pages.map((page) => ({ ...page, rows: page.rows.filter((row) => row.id !== 'r0') })),
      }))
    })
    await waitFor(() => expect(rowIds(result)).toEqual(['r1']))
    // A patch is not a refetch — no second request fired.
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('reset drops every cached page set for the namespace', async () => {
    const wrapper = makeWrapper()
    const { fetchPage } = makePager(3)
    const { result } = renderHook(
      () =>
        useAdminInfiniteList({
          namespace: makeNamespace(fetchPage),
          pageSize: 2,
          buildInput: (offset) => ({ offset, limit: 2 }),
          selectRows: (page) => page.rows,
          noun: '项目',
        }),
      { wrapper },
    )

    await waitFor(() => expect(rowIds(result)).toEqual(['r0', 'r1']))
    expect(wrapper.queryClient.getQueryData(['test', 'admin-infinite-list'])).toBeDefined()

    act(() => {
      result.current.reset()
    })
    // The cache entry is gone. Reset only drops the cache — the caller
    // re-arms the machine (the music search flips `enabled` alongside).
    expect(wrapper.queryClient.getQueryData(['test', 'admin-infinite-list'])).toBeUndefined()
  })
})
