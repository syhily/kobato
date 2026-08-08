// @vitest-environment happy-dom

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommentFilterFieldKey } from '@/ui/admin/comments/filter-fields'
import type { ActiveFilter } from '@/ui/admin/shared/filterPillsReducer'

// The hook drives its search / rehydrate lookups through react-query against
// the oRPC client, mocked as a plain object so `orpcQuery` derives real
// query options over the stubbed procedures.
const api = vi.hoisted(() => ({
  searchPages: vi.fn(),
  searchAuthors: vi.fn(),
}))

vi.mock('@/client/api/client', () => ({
  orpc: {
    admin: {
      comments: {
        searchPages: (input: unknown) => api.searchPages(input),
        searchAuthors: (input: unknown) => api.searchAuthors(input),
      },
    },
  },
}))

import { COMMENT_FILTER_FIELDS } from '@/ui/admin/comments/filter-fields'
import { useFilterPills } from '@/ui/admin/shared/filter-bar/useFilterPills'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function renderPills(options: Parameters<typeof useFilterPills<CommentFilterFieldKey>>[0]) {
  return renderHook(() => useFilterPills(options), { wrapper: makeWrapper() })
}

beforeEach(() => {
  api.searchPages.mockReset()
  api.searchAuthors.mockReset()
})

describe('useFilterPills — uncontrolled reducer', () => {
  it('adds, replaces (one pill per field), removes and clears filters', () => {
    const { result } = renderPills({ fields: COMMENT_FILTER_FIELDS, initial: [] })

    act(() => result.current.dispatch({ type: 'addFilter', field: 'status', value: 'pending', label: '待审核' }))
    act(() => result.current.dispatch({ type: 'addFilter', field: 'author', value: 'u1', label: 'Alice' }))
    expect(result.current.filters).toEqual([
      { field: 'status', value: 'pending', label: '待审核' },
      { field: 'author', value: 'u1', label: 'Alice' },
    ])
    expect(result.current.hasFilters).toBe(true)

    act(() => result.current.dispatch({ type: 'addFilter', field: 'status', value: 'approved', label: '已审核' }))
    expect(result.current.filters).toEqual([
      { field: 'author', value: 'u1', label: 'Alice' },
      { field: 'status', value: 'approved', label: '已审核' },
    ])

    act(() => result.current.dispatch({ type: 'removeFilter', field: 'author' }))
    expect(result.current.filters).toEqual([{ field: 'status', value: 'approved', label: '已审核' }])

    act(() => result.current.dispatch({ type: 'clearFilters' }))
    expect(result.current.filters).toEqual([])
    expect(result.current.hasFilters).toBe(false)
  })
})

describe('useFilterPills — controlled mode', () => {
  it('notifies onChange with the produced state and adopts external value changes', async () => {
    const onChange = vi.fn()
    const pending: ActiveFilter<CommentFilterFieldKey>[] = [{ field: 'status', value: 'pending', label: '待审核' }]
    const { result, rerender } = renderHook(
      ({ value }: { value: ActiveFilter<CommentFilterFieldKey>[] }) =>
        useFilterPills({ fields: COMMENT_FILTER_FIELDS, value, onChange }),
      { wrapper: makeWrapper(), initialProps: { value: pending } },
    )

    expect(result.current.filters).toEqual(pending)

    act(() => result.current.dispatch({ type: 'removeFilter', field: 'status' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([], { type: 'removeFilter', field: 'status' }))
    // The local state follows the dispatch optimistically.
    expect(result.current.filters).toEqual([])

    const fromUrl: ActiveFilter<CommentFilterFieldKey>[] = [{ field: 'page', value: 'p1', label: 'Hello' }]
    rerender({ value: fromUrl })
    expect(result.current.filters).toEqual(fromUrl)
  })

  it('keeps a transient empty text pill that maps to no URL change', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useFilterPills({ fields: COMMENT_FILTER_FIELDS, value: [], onChange }), {
      wrapper: makeWrapper(),
    })

    // The empty text pill maps to q: null, so the value prop never changes and the pill stays editable.
    act(() =>
      result.current.dispatch({
        type: 'addFilter',
        field: 'text',
        value: JSON.stringify({ op: 'contains', value: '' }),
        label: '内容',
      }),
    )
    expect(result.current.filters).toEqual([
      { field: 'text', value: JSON.stringify({ op: 'contains', value: '' }), label: '内容' },
    ])
  })
})

describe('useFilterPills — queryInput merging', () => {
  it('merges every active field’s toQuery patch', () => {
    const { result } = renderPills({
      fields: COMMENT_FILTER_FIELDS,
      initial: [
        { field: 'status', value: 'pending', label: '待审核' },
        { field: 'page', value: 'page-1', label: 'Page' },
        { field: 'author', value: 'user-42', label: 'Author' },
        { field: 'text', value: JSON.stringify({ op: 'contains', value: 'foo' }), label: 'Text' },
        { field: 'date', value: JSON.stringify({ date: '2024-03-15', op: 'is-greater' }), label: 'Date' },
      ],
    })

    const expectedEnd = new Date('2024-03-15')
    expectedEnd.setHours(23, 59, 59, 999)
    expect(result.current.queryInput()).toEqual({
      status: 'pending',
      pageKey: 'page-1',
      userId: 'user-42',
      q: 'foo',
      match: 'contains',
      createdAfter: expectedEnd.toISOString(),
    })
  })

  it('contributes nothing for empty codec defaults (fresh instant-added pills)', () => {
    const { result } = renderPills({
      fields: COMMENT_FILTER_FIELDS,
      initial: [
        { field: 'text', value: JSON.stringify({ op: 'contains', value: '' }), label: '内容' },
        { field: 'date', value: JSON.stringify({ date: '', op: 'is-or-less' }), label: '时间' },
      ],
    })
    expect(result.current.queryInput()).toEqual({})
  })
})

describe('useFilterPills — codec fallbacks', () => {
  it('falls back to the editor default on malformed JSON and never throws', () => {
    const { result } = renderPills({
      fields: COMMENT_FILTER_FIELDS,
      initial: [
        { field: 'text', value: '{not json', label: '内容' },
        { field: 'date', value: '{"op":"bogus"}', label: '时间' },
      ],
    })

    expect(result.current.text('text')).toEqual({ op: 'contains', value: '' })
    expect(result.current.dateSingle('date')).toBeNull()
    expect(result.current.dateRange('date')).toBeNull()
    expect(result.current.queryInput()).toEqual({})
  })

  it('returns the parsed codec values through the typed accessors', () => {
    const { result } = renderPills({
      fields: COMMENT_FILTER_FIELDS,
      initial: [
        { field: 'text', value: JSON.stringify({ op: 'does-not-contain', value: 'foo' }), label: 'Text' },
        { field: 'date', value: JSON.stringify({ date: '2024-03-15', op: 'is-or-less' }), label: 'Date' },
      ],
    })
    expect(result.current.text('text')).toEqual({ op: 'does-not-contain', value: 'foo' })
    expect(result.current.dateSingle('date')).toEqual({ date: '2024-03-15', op: 'is-or-less' })
  })
})

describe('useFilterPills — async search', () => {
  it('debounces the search input before re-firing the field query', async () => {
    api.searchPages.mockResolvedValue({ pages: [{ key: 'p1', title: 'Hello' }] })
    const { result } = renderPills({ fields: COMMENT_FILTER_FIELDS, initial: [] })

    // The idle query fires immediately with an empty input.
    await waitFor(() => expect(result.current.bar.search.page?.items).toEqual([{ value: 'p1', label: 'Hello' }]))
    expect(api.searchPages).toHaveBeenCalledWith({})

    act(() => result.current.bar.search.page?.setQuery('sec'))
    // The debounce window hasn't elapsed — no refetch with the new term yet.
    expect(api.searchPages).not.toHaveBeenCalledWith({ q: 'sec' })
    await waitFor(() => expect(api.searchPages).toHaveBeenCalledWith({ q: 'sec' }))
  })

  it('pins the selected value into the search items when it is not in the fetched window', async () => {
    // The idle search window must not displace the pinned selection.
    api.searchPages.mockImplementation((input: { key?: string }) =>
      Promise.resolve(
        input.key === 'pinned'
          ? { pages: [{ key: 'pinned', title: 'Pinned Page' }] }
          : { pages: [{ key: 'p1', title: 'Hello' }] },
      ),
    )
    const { result } = renderPills({
      fields: COMMENT_FILTER_FIELDS,
      initial: [{ field: 'page', value: 'pinned', label: 'Pinned Page' }],
    })

    await waitFor(() =>
      expect(result.current.bar.search.page?.items).toEqual([
        { value: 'pinned', label: 'Pinned Page' },
        { value: 'p1', label: 'Hello' },
      ]),
    )
  })

  it('rehydrates a URL-restored pill label via resolveOptions → renameFilter', async () => {
    api.searchPages.mockImplementation((input: { key?: string }) =>
      Promise.resolve(input.key ? { pages: [{ key: 'p1', title: 'Hello World' }] } : { pages: [] }),
    )
    const { result } = renderPills({
      fields: COMMENT_FILTER_FIELDS,
      initial: [{ field: 'page', value: 'p1', label: 'p1' }],
    })

    await waitFor(() => expect(result.current.filters[0]?.label).toBe('Hello World'))
    expect(api.searchPages).toHaveBeenCalledWith({ key: 'p1' })
  })

  it('falls back to the raw value when the title is empty (无标题)', async () => {
    api.searchPages.mockImplementation((input: { key?: string }) =>
      Promise.resolve(input.key ? { pages: [{ key: 'p1', title: null }] } : { pages: [] }),
    )
    const { result } = renderPills({
      fields: COMMENT_FILTER_FIELDS,
      initial: [{ field: 'page', value: 'p1', label: 'p1' }],
    })

    await waitFor(() => expect(result.current.filters[0]?.label).toBe('无标题'))
  })
})
