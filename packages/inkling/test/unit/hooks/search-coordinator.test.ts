import { describe, expect, it, vi } from 'vitest'

import { tick } from '#/utils/test-editor'
import { createSearchCoordinator, type SearchResult, type SearchScheduler } from '@/hooks/search-coordinator'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((r, j) => {
    resolve = r
    reject = j
  })
  return { promise, resolve, reject }
}

function resultsFor(label: string): SearchResult[] {
  return [{ label, items: [{ title: `${label} result`, url: `https://example.com/${label}` }] }]
}

interface ManualScheduler extends SearchScheduler {
  flush: () => void
  pendingCount: () => number
}

function createManualScheduler(): ManualScheduler {
  const pending: Array<{ fn: () => void; cancelled: boolean }> = []
  return {
    schedule(fn) {
      const entry = { fn, cancelled: false }
      pending.push(entry)
      return () => {
        entry.cancelled = true
      }
    },
    flush() {
      const due = pending.splice(0)
      for (const entry of due) {
        if (!entry.cancelled) {
          entry.fn()
        }
      }
    },
    pendingCount: () => pending.filter((entry) => !entry.cancelled).length,
  }
}

function setup({ searchLinks }: { searchLinks?: (term?: string) => Promise<SearchResult[] | undefined> } = {}) {
  const scheduler = createManualScheduler()
  const coordinator = createSearchCoordinator({ searchLinks, scheduler })
  return { coordinator, scheduler }
}

describe('createSearchCoordinator', () => {
  it('resolves like a cancelled search when no search function is provided', async () => {
    const { coordinator, scheduler } = setup()
    coordinator.start()
    coordinator.setQuery('hello')
    scheduler.flush()
    await tick()

    const snapshot = coordinator.getSnapshot()
    expect(snapshot.isSearching).toBe(false)
    expect(snapshot.listOptions).toEqual([])
    expect(snapshot.defaultListOptions[0].items[0].type).toBe('no-results')
  })

  it('ignores stale responses that resolve out of order', async () => {
    const first = deferred<SearchResult[]>()
    const second = deferred<SearchResult[]>()
    // route by term: the default prefetch (term undefined) never consumes a query mock
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>((term) => {
      if (term === 'first') {
        return first.promise
      }
      if (term === 'second') {
        return second.promise
      }
      return Promise.resolve(resultsFor('default'))
    })

    const { coordinator, scheduler } = setup({ searchLinks })
    coordinator.start()

    coordinator.setQuery('first')
    scheduler.flush()
    coordinator.setQuery('second')
    scheduler.flush()

    // the older response lands last — it must not overwrite the newer one
    second.resolve(resultsFor('second'))
    await tick()
    first.resolve(resultsFor('first'))
    await tick()

    const snapshot = coordinator.getSnapshot()
    expect(snapshot.isSearching).toBe(false)
    expect(snapshot.listOptions[0].items[0].label).toBe('second result')
  })

  it('distinguishes overlapping requests that repeat the same term', async () => {
    const first = deferred<SearchResult[]>()
    const second = deferred<SearchResult[]>()
    let queryCalls = 0
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>((term) => {
      if (term === undefined) {
        return Promise.resolve(resultsFor('default'))
      }
      queryCalls += 1
      return queryCalls === 1 ? first.promise : second.promise
    })

    const { coordinator, scheduler } = setup({ searchLinks })
    coordinator.start()

    coordinator.setQuery('same')
    scheduler.flush()
    coordinator.setQuery('same')
    scheduler.flush()

    expect(queryCalls).toBe(2)

    first.resolve(resultsFor('stale'))
    await tick()
    // the stale first response neither shows nor settles the search
    expect(coordinator.getSnapshot().isSearching).toBe(true)
    expect(coordinator.getSnapshot().listOptions).toEqual([])

    second.resolve(resultsFor('fresh'))
    await tick()
    expect(coordinator.getSnapshot().isSearching).toBe(false)
    expect(coordinator.getSnapshot().listOptions[0].items[0].label).toBe('fresh result')
  })

  it('clears the searching state when the search resolves to undefined', async () => {
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[] | undefined>>(() => Promise.resolve(undefined))
    const { coordinator, scheduler } = setup({ searchLinks })
    coordinator.start()

    coordinator.setQuery('hello')
    scheduler.flush()
    expect(coordinator.getSnapshot().isSearching).toBe(true)

    await tick()
    expect(coordinator.getSnapshot().isSearching).toBe(false)
    expect(coordinator.getSnapshot().listOptions).toEqual([])
  })

  it('clears the searching state and preserves options when the search rejects', async () => {
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[] | undefined>>((term) => {
      if (term === 'kept') {
        return Promise.resolve(resultsFor('kept'))
      }
      if (term === 'boom') {
        return Promise.reject(new Error('nope'))
      }
      return Promise.resolve(resultsFor('default'))
    })

    const { coordinator, scheduler } = setup({ searchLinks })
    coordinator.start()

    coordinator.setQuery('kept')
    scheduler.flush()
    await tick()
    expect(coordinator.getSnapshot().listOptions[0].items[0].label).toBe('kept result')

    coordinator.setQuery('boom')
    scheduler.flush()
    await tick()

    expect(coordinator.getSnapshot().isSearching).toBe(false)
    expect(coordinator.getSnapshot().listOptions[0].items[0].label).toBe('kept result')
  })

  it('shows the URL option for URL queries without searching', () => {
    const searchLinks = vi.fn()
    const { coordinator, scheduler } = setup({ searchLinks })
    coordinator.start()

    coordinator.setQuery('https://example.com/page')

    expect(searchLinks).not.toHaveBeenCalledWith('https://example.com/page')
    expect(scheduler.pendingCount()).toBe(0)
    const snapshot = coordinator.getSnapshot()
    expect(snapshot.isSearching).toBe(false)
    expect(snapshot.listOptions[0].items[0]).toMatchObject({ label: 'https://example.com/page', type: 'url' })
  })

  it('treats mailto: queries as URLs without searching', () => {
    const searchLinks = vi.fn()
    const { coordinator, scheduler } = setup({ searchLinks })
    coordinator.start()

    coordinator.setQuery('mailto:a@example.com')

    expect(scheduler.pendingCount()).toBe(0)
    expect(coordinator.getSnapshot().listOptions[0].items[0]).toMatchObject({
      label: 'mailto:a@example.com',
      type: 'url',
    })
  })

  it('does not let a pending text search overwrite a URL result', async () => {
    const pendingSearch = deferred<SearchResult[]>()
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>((term) =>
      term === 'hello' ? pendingSearch.promise : Promise.resolve(resultsFor('default')),
    )

    const { coordinator, scheduler } = setup({ searchLinks })
    coordinator.start()

    coordinator.setQuery('hello')
    scheduler.flush()
    coordinator.setQuery('https://example.com')
    expect(coordinator.getSnapshot().listOptions[0].items[0].type).toBe('url')

    pendingSearch.resolve(resultsFor('late'))
    await tick()

    const snapshot = coordinator.getSnapshot()
    expect(snapshot.listOptions[0].items[0].type).toBe('url')
    expect(snapshot.isSearching).toBe(false)
  })

  it('keeps a URL result settled when the delayed default search rejects', async () => {
    const defaultFetch = deferred<SearchResult[]>()
    const searchLinks = vi
      .fn<(term?: string) => Promise<SearchResult[]>>()
      .mockImplementation(() => defaultFetch.promise)

    const { coordinator } = setup({ searchLinks })
    coordinator.start()
    coordinator.setQuery('https://example.com')

    defaultFetch.reject(new Error('default failed'))
    await tick()

    const snapshot = coordinator.getSnapshot()
    expect(snapshot.isSearching).toBe(false)
    expect(snapshot.listOptions[0].items[0].type).toBe('url')
  })

  it('prefetches defaults on start and marks them as the default type', async () => {
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>(() => Promise.resolve(resultsFor('default')))
    const { coordinator } = setup({ searchLinks })

    coordinator.start()
    await tick()

    expect(searchLinks).toHaveBeenCalledWith()
    const snapshot = coordinator.getSnapshot()
    expect(snapshot.defaultListOptions[0].items[0]).toMatchObject({
      label: 'default result',
      type: 'default',
      highlight: false,
    })
  })

  it('waits for the default prefetch on an empty query, then settles', async () => {
    const defaultFetch = deferred<SearchResult[]>()
    const searchLinks = vi
      .fn<(term?: string) => Promise<SearchResult[]>>()
      .mockImplementation(() => defaultFetch.promise)

    const { coordinator } = setup({ searchLinks })
    coordinator.start()
    coordinator.setQuery('')

    expect(coordinator.getSnapshot().isSearching).toBe(true)

    defaultFetch.resolve(resultsFor('default'))
    await tick()

    expect(coordinator.getSnapshot().isSearching).toBe(false)
    expect(coordinator.getSnapshot().defaultListOptions[0].items[0].label).toBe('default result')
  })

  it('does not wait when the defaults are already loaded', async () => {
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>(() => Promise.resolve(resultsFor('default')))
    const { coordinator } = setup({ searchLinks })
    coordinator.start()
    await tick()

    coordinator.setQuery('')
    expect(coordinator.getSnapshot().isSearching).toBe(false)
  })

  it('maps search results to list options', async () => {
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>(() =>
      Promise.resolve([
        { label: 'Pages', items: [{ title: 'Home', url: 'https://example.com/home', metaText: 'meta' }] },
      ]),
    )
    const { coordinator, scheduler } = setup({ searchLinks })
    coordinator.start()

    coordinator.setQuery('home')
    scheduler.flush()
    await tick()

    const item = coordinator.getSnapshot().listOptions[0].items[0]
    expect(item).toMatchObject({
      label: 'Home',
      value: 'https://example.com/home',
      type: 'internal',
      highlight: true,
      metaText: 'meta',
    })
  })

  it('shows the no-results option when a search returns an empty array', async () => {
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>(() => Promise.resolve([]))
    const { coordinator, scheduler } = setup({ searchLinks })
    coordinator.start()

    coordinator.setQuery('nothing')
    scheduler.flush()
    await tick()

    expect(coordinator.getSnapshot().listOptions[0].items[0].type).toBe('no-results')
  })

  it('uses custom noResultOptions when a search returns nothing', async () => {
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>(() => Promise.resolve([]))
    const scheduler = createManualScheduler()
    const coordinator = createSearchCoordinator({
      searchLinks,
      scheduler,
      noResultOptions: () => [{ label: 'No results found', items: [] }],
    })
    coordinator.start()

    coordinator.setQuery('nothing')
    scheduler.flush()
    await tick()

    expect(coordinator.getSnapshot().listOptions).toEqual([{ label: 'No results found', items: [] }])
  })

  it('supersedes a scheduled-but-not-yet-run search', () => {
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>(() => Promise.resolve(resultsFor('x')))
    const { coordinator, scheduler } = setup({ searchLinks })
    coordinator.start()

    coordinator.setQuery('first')
    coordinator.setQuery('second')

    scheduler.flush()
    expect(searchLinks).toHaveBeenCalledWith('second')
    expect(searchLinks).not.toHaveBeenCalledWith('first')
  })

  it('invalidates in-flight work on dispose', async () => {
    const pendingSearch = deferred<SearchResult[]>()
    const searchLinks = vi.fn<(term?: string) => Promise<SearchResult[]>>((term) =>
      term === 'hello' ? pendingSearch.promise : Promise.resolve(resultsFor('default')),
    )

    const { coordinator, scheduler } = setup({ searchLinks })
    coordinator.start()
    coordinator.setQuery('hello')
    scheduler.flush()

    coordinator.dispose()
    pendingSearch.resolve(resultsFor('late'))
    await tick()

    const snapshot = coordinator.getSnapshot()
    expect(snapshot.listOptions).toEqual([])
    expect(snapshot.isSearching).toBe(true) // never settled: the request was invalidated
  })
})
