import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type SearchResult, useSearchLinks } from '@/hooks/useSearchLinks'

// Adapter tests: the request tracks and race policy live in
// search-coordinator.test.ts (synchronous, injected scheduler). This file only
// pins the hook's wiring — mount prefetch, debounced query, and the
// query/defaults display switch — with fake timers instead of wall-clock
// debounce sleeps.

function resultsFor(label: string): SearchResult[] {
  return [{ label, items: [{ title: `${label} result`, url: `https://example.com/${label}` }] }]
}

async function flushPromises() {
  await act(async () => {})
}

async function advanceDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150)
  })
}

describe('useSearchLinks', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('prefetches default options on mount and shows them while the query is empty', async () => {
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>(() => Promise.resolve(resultsFor('default')))
    const { result } = renderHook(() => useSearchLinks('', searchLinks))

    await flushPromises()

    expect(searchLinks).toHaveBeenCalledWith()
    expect(result.current.isSearching).toBe(false)
    expect(result.current.listOptions[0].items[0]).toMatchObject({ label: 'default result', type: 'default' })
  })

  it('searches after the debounce and shows the results', async () => {
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>((term) =>
      Promise.resolve(resultsFor(term === 'hello' ? 'query' : 'default')),
    )
    const { result } = renderHook(() => useSearchLinks('hello', searchLinks))

    await flushPromises()
    expect(searchLinks).not.toHaveBeenCalledWith('hello')

    await advanceDebounce()

    expect(searchLinks).toHaveBeenCalledWith('hello')
    expect(result.current.listOptions[0].items[0].label).toBe('query result')
    expect(result.current.isSearching).toBe(false)
  })

  it('shows the default options again when the query is cleared', async () => {
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>((term) =>
      Promise.resolve(resultsFor(term === 'hello' ? 'query' : 'default')),
    )
    const { result, rerender } = renderHook(({ query }) => useSearchLinks(query, searchLinks), {
      initialProps: { query: 'hello' },
    })

    await advanceDebounce()
    expect(result.current.listOptions[0].items[0].label).toBe('query result')

    rerender({ query: '' })
    await flushPromises()

    expect(result.current.listOptions[0].items[0].label).toBe('default result')
    expect(result.current.isSearching).toBe(false)
  })

  it('shows the URL option immediately for URL queries', async () => {
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>((term) =>
      Promise.resolve(resultsFor(term === undefined ? 'default' : 'query')),
    )
    const { result } = renderHook(() => useSearchLinks('https://example.com', searchLinks))

    await flushPromises()

    expect(searchLinks).not.toHaveBeenCalledWith('https://example.com')
    expect(result.current.listOptions[0].items[0]).toMatchObject({ label: 'https://example.com', type: 'url' })
  })
})
